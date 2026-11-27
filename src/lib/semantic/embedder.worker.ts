/**
 * On-device embedder (Web Worker). Started by client.ts only after the clinician turns the feature on.
 *
 * Privacy and network:
 * - Every file comes from this app's own origin: /models/** (model + lexicon embeddings) and /ort/**
 *   (onnxruntime-web). Remote model downloads are off (env.allowRemoteModels = false) and env.fetch
 *   refuses any URL on another origin, so the CSP `connect-src 'self'` holds and nothing leaves the device.
 * - Text arrives already PHI-scrubbed; it is embedded in memory and never stored, logged or posted
 *   anywhere but back to the page. A small in-memory cache of segment vectors is dropped on "clear" and
 *   when the worker is terminated.
 *
 * Integrity: every model file and both runtime files are pinned (size + SHA-256, src/lib/semantic/model.ts). The
 *   worker hashes each one as it arrives (and each Cache Storage copy before reuse) and refuses anything that does
 *   not match ("integrity" error), so a stale, corrupted or swapped file is never run. Paths under /models/<model>/
 *   that have no pin are refused too. The lexicon embeddings are app-generated data and are schema-checked instead.
 *
 * Runtime: onnxruntime-web, CPU (WebAssembly SIMD). The plain build is loaded from /ort/ (the module
 * glue by dynamic import, the binary fetched here so progress can be shown). Single-threaded unless the
 * page is cross-origin isolated.
 */
import { env, pipeline } from "@huggingface/transformers";
import { decodeLexiconEmbeddings, normalize, rankSuggestions, splitSegments, type LexiconIndex } from "./core";
import {
  DOWNLOAD_ESTIMATE_BYTES,
  LEXICON_EMBEDDINGS_URL,
  LOCAL_MODEL_PATH,
  MODEL_DIMS,
  MODEL_DTYPE,
  MODEL_NAME,
  MODEL_REVISION,
  ORT_FILES,
  ORT_WASM_PATH,
  matchesPin,
  pinFor,
} from "./model";
import type { LoadPhase, SemanticErrorCode, WorkerRequest, WorkerResponse } from "./protocol";
import { ERROR_MESSAGES } from "./protocol";

interface WorkerScope {
  postMessage(message: WorkerResponse): void;
  addEventListener(type: "message", listener: (event: MessageEvent<WorkerRequest>) => void): void;
  location: { origin: string; href: string };
  crossOriginIsolated?: boolean;
  navigator?: { hardwareConcurrency?: number };
}
const scope = globalThis as unknown as WorkerScope;

type Extractor = (text: string, options: { pooling: "mean"; normalize: boolean }) => Promise<{ data: ArrayLike<number> }>;

let index: LexiconIndex | null = null;
let extractor: Extractor | null = null;
let loading: Promise<void> | null = null;
let threads = 1;

class LoadError extends Error {
  constructor(readonly code: SemanticErrorCode) {
    super(ERROR_MESSAGES[code]);
  }
}

/* ------------------------------------------------------------------ */
/* Same-origin fetch only                                              */
/* ------------------------------------------------------------------ */

function sameOrigin(input: string | URL): URL {
  const url = new URL(String(input), scope.location.href);
  if (url.origin !== scope.location.origin || (url.protocol !== "https:" && url.protocol !== "http:")) throw new LoadError("load-failed");
  return url;
}

const guardedFetch = (input: string | URL, init?: RequestInit): Promise<Response> =>
  fetch(sameOrigin(input), { ...init, credentials: "same-origin", redirect: "error" });

const MODEL_DIR = `${LOCAL_MODEL_PATH}${MODEL_NAME}/`;

/**
 * Refuses a file under the model folder that has no pin, and any pinned file whose bytes do not match. Returns
 * the pin (or null for files outside the pinned folders, such as the lexicon embeddings).
 */
/** Set when any file fails its pin, so a library error that wraps ours is still reported as "integrity". */
let integrityFailed = false;

function integrityError(): LoadError {
  integrityFailed = true;
  return new LoadError("integrity");
}

function requirePin(url: URL) {
  const pin = pinFor(url.pathname);
  if (!pin && url.pathname.startsWith(MODEL_DIR)) throw integrityError();
  return pin;
}

async function verified(url: URL, bytes: ArrayBuffer): Promise<ArrayBuffer> {
  const pin = requirePin(url);
  if (pin && !(await matchesPin(bytes, pin))) throw integrityError();
  return bytes;
}

/**
 * env.fetch for transformers.js: same origin only, and pinned files are read whole and hashed before the library
 * sees a byte. A 404 passes through (the library reports it, mapped to "files-missing" below).
 */
async function verifyingFetch(input: string | URL, init?: RequestInit): Promise<Response> {
  const url = sameOrigin(input);
  requirePin(url);
  const res = await guardedFetch(url, init);
  if (!res.ok) return res;
  const bytes = await verified(url, await res.arrayBuffer());
  return new Response(bytes, { status: 200, headers: { "content-type": res.headers.get("content-type") ?? "application/octet-stream", "content-length": String(bytes.byteLength) } });
}

interface CacheLike {
  match(request: string): Promise<Response | undefined>;
  put(request: string, response: Response): Promise<void>;
  delete(request: string): Promise<boolean>;
}

/**
 * Cache Storage wrapper for transformers.js (env.customCache): a cached copy is hashed again before reuse and
 * deleted when it does not match, so the library re-fetches it through verifyingFetch.
 */
function verifyingCache(name: string): CacheLike {
  const open = () => caches.open(name);
  return {
    async match(request) {
      const cache = await open();
      const hit = await cache.match(request);
      if (!hit) return undefined;
      const url = sameOrigin(request);
      try {
        const bytes = await verified(url, await hit.arrayBuffer());
        return new Response(bytes, { status: 200, headers: { "content-type": hit.headers.get("content-type") ?? "application/octet-stream" } });
      } catch {
        await cache.delete(request);
        return undefined;
      }
    },
    async put(request, response) {
      sameOrigin(request);
      await (await open()).put(request, response);
    },
    async delete(request) {
      return (await open()).delete(request);
    },
  };
}

/* ------------------------------------------------------------------ */
/* Progress                                                            */
/* ------------------------------------------------------------------ */

const fileBytes = new Map<string, { loaded: number; total: number }>();
let phase: LoadPhase = "lexicon";
let progressId = 0;
let lastPost = 0;

function postProgress(force = false): void {
  const now = Date.now();
  if (!force && now - lastPost < 100) return;
  lastPost = now;
  let loaded = 0;
  let known = 0;
  for (const f of fileBytes.values()) {
    loaded += f.loaded;
    known += Math.max(f.total, f.loaded);
  }
  const estimate = DOWNLOAD_ESTIMATE_BYTES.model + DOWNLOAD_ESTIMATE_BYTES.runtime + DOWNLOAD_ESTIMATE_BYTES.lexicon;
  const total = Math.max(known, estimate, loaded);
  const fraction = phase === "warmup" ? 1 : Math.min(0.99, loaded / total);
  scope.postMessage({ type: "progress", id: progressId, progress: { phase, loaded, total, fraction } });
}

function track(file: string, loaded: number, total: number): void {
  fileBytes.set(file, { loaded, total: Number.isFinite(total) ? total : 0 });
  postProgress();
}

/** Fetch a same-origin file into memory, reporting bytes as they arrive. */
async function fetchBytes(path: string, estimate: number): Promise<ArrayBuffer> {
  const url = sameOrigin(path);
  const res = await guardedFetch(url, { cache: "default" });
  if (res.status === 404) throw new LoadError("files-missing");
  if (!res.ok || !res.body) throw new LoadError("load-failed");
  // Content-Length is the compressed size when the server gzips, so it is only a hint.
  const header = Number(res.headers.get("content-length") ?? NaN);
  const hint = Number.isFinite(header) && header > 0 ? Math.max(header, estimate) : estimate;
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.byteLength;
    track(path, received, Math.max(hint, received));
  }
  track(path, received, received);
  const out = new Uint8Array(received);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.byteLength;
  }
  return verified(url, out.buffer);
}

/* ------------------------------------------------------------------ */
/* Load                                                                */
/* ------------------------------------------------------------------ */

const SIMD_PROBE = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]);

function wasmSimdSupported(): boolean {
  try {
    return typeof WebAssembly === "object" && WebAssembly.validate(SIMD_PROBE);
  } catch {
    return false;
  }
}

interface TransformersProgress {
  status?: string;
  file?: string;
  loaded?: number;
  total?: number;
}

async function load(cacheModel: boolean): Promise<void> {
  if (!wasmSimdSupported()) throw new LoadError("unsupported");
  if (!globalThis.crypto?.subtle) throw new LoadError("unsupported"); // integrity checks need Web Crypto (HTTPS)
  integrityFailed = false;

  phase = "lexicon";
  postProgress(true);
  const lexBuf = await fetchBytes(LEXICON_EMBEDDINGS_URL, DOWNLOAD_ESTIMATE_BYTES.lexicon);
  try {
    index = decodeLexiconEmbeddings(JSON.parse(new TextDecoder().decode(lexBuf)));
  } catch {
    throw new LoadError("load-failed");
  }

  phase = "runtime";
  postProgress(true);
  const [mjsFile, wasmFile] = ORT_FILES;
  const wasmBinary = await fetchBytes(`${ORT_WASM_PATH}${wasmFile}`, DOWNLOAD_ESTIMATE_BYTES.runtime);
  // The module glue is imported by onnxruntime-web itself; check the served copy against its pin first.
  await fetchBytes(`${ORT_WASM_PATH}${mjsFile}`, 0);
  const onnx = env.backends.onnx as { wasm?: Record<string, unknown> };
  if (!onnx.wasm) throw new LoadError("load-failed");
  threads = scope.crossOriginIsolated ? Math.max(1, Math.min(4, scope.navigator?.hardwareConcurrency ?? 1)) : 1;
  // Replace the library's default (a public CDN) with our own copy: only the module glue path is given,
  // so the binary we just fetched is used as is and nothing else is requested.
  onnx.wasm.wasmPaths = { mjs: new URL(`${ORT_WASM_PATH}${mjsFile}`, scope.location.origin).href };
  onnx.wasm.wasmBinary = wasmBinary;
  onnx.wasm.numThreads = threads;
  onnx.wasm.proxy = false;

  phase = "model";
  postProgress(true);
  env.allowRemoteModels = false;
  env.allowLocalModels = true;
  env.localModelPath = LOCAL_MODEL_PATH;
  // Model files are cached (when allowed) only through the verifying wrapper, never the library's raw cache.
  env.useBrowserCache = false;
  env.useCustomCache = cacheModel && typeof caches !== "undefined";
  env.customCache = env.useCustomCache ? (verifyingCache(env.cacheKey) as unknown as typeof env.customCache) : null;
  env.useWasmCache = false;
  env.useFSCache = false;
  (env as { experimental_useCrossOriginStorage?: boolean }).experimental_useCrossOriginStorage = false;
  env.fetch = verifyingFetch;
  let pipe: unknown;
  try {
    pipe = await pipeline("feature-extraction", MODEL_NAME, {
      dtype: MODEL_DTYPE,
      device: "wasm",
      progress_callback: (p: TransformersProgress) => {
        if (p.status === "progress" && p.file) track(`model:${p.file}`, p.loaded ?? 0, p.total ?? 0);
      },
    });
  } catch (err) {
    if (err instanceof LoadError) throw err;
    if (integrityFailed) throw new LoadError("integrity");
    const msg = err instanceof Error ? err.message : "";
    throw new LoadError(/404|not found|could not locate/i.test(msg) ? "files-missing" : "load-failed");
  }
  extractor = pipe as Extractor;

  phase = "warmup";
  postProgress(true);
  await embedOne("warm up");
}

/* ------------------------------------------------------------------ */
/* Embedding                                                           */
/* ------------------------------------------------------------------ */

/** Recent segment vectors (memory only) so re-suggesting while the clinician types is cheap. */
const vectorCache = new Map<string, Float32Array>();
const CACHE_MAX = 128;

/** One text per call: the int8 model's per-tensor activation quantization makes batches interfere. */
async function embedOne(text: string): Promise<Float32Array> {
  const hit = vectorCache.get(text);
  if (hit) return hit;
  if (!extractor) throw new LoadError("not-loaded");
  const t = await extractor(text, { pooling: "mean", normalize: true });
  const v = normalize(Float32Array.from(Array.prototype.slice.call(t.data, 0, MODEL_DIMS) as number[]));
  vectorCache.set(text, v);
  if (vectorCache.size > CACHE_MAX) vectorCache.delete(vectorCache.keys().next().value as string);
  return v;
}

/* ------------------------------------------------------------------ */
/* Messages                                                            */
/* ------------------------------------------------------------------ */

function fail(id: number, err: unknown, fallback: SemanticErrorCode): void {
  const code = err instanceof LoadError ? err.code : fallback;
  scope.postMessage({ type: "error", id, code, message: ERROR_MESSAGES[code] });
}

scope.addEventListener("message", (event) => {
  const msg = event.data;
  if (!msg || typeof msg !== "object") return;

  if (msg.type === "load") {
    progressId = msg.id;
    if (!loading) loading = load(msg.cacheModel === true);
    loading.then(
      () =>
        scope.postMessage({
          type: "ready",
          id: msg.id,
          info: {
            model: MODEL_NAME,
            revision: MODEL_REVISION,
            symptoms: index?.entries.length ?? 0,
            phrases: index?.phraseCount ?? 0,
            threads,
            backend: "wasm",
          },
        }),
      (err) => {
        loading = null;
        fail(msg.id, err, "load-failed");
      },
    );
    return;
  }

  if (msg.type === "suggest") {
    void (async () => {
      try {
        if (!loading) throw new LoadError("not-loaded");
        await loading;
        if (!index) throw new LoadError("not-loaded");
        const segments = splitSegments(typeof msg.text === "string" ? msg.text : "");
        const vectors: Float32Array[] = [];
        for (const s of segments) vectors.push(await embedOne(s.text));
        const suggestions = rankSuggestions(segments, vectors, index, msg.options ?? {});
        scope.postMessage({ type: "result", id: msg.id, suggestions });
      } catch (err) {
        fail(msg.id, err, "failed");
      }
    })();
    return;
  }

  if (msg.type === "clear") {
    vectorCache.clear();
    scope.postMessage({ type: "cleared", id: msg.id });
  }
});
