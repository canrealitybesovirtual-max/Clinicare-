/**
 * Page-side API of the on-device semantic matcher (docs/ON-DEVICE-AI.md). Browser only.
 *
 *   semanticSupport()                      can this browser run it? (no side effects)
 *   loadSemanticModel({ cacheModel })      start the worker and download the model (~40 MB, same origin)
 *   semanticSuggest(scrubbedText, opts)    -> Promise<{ symptomId, score, phrase, clause }[]>
 *   disableSemanticModel()                 stop the worker and free its memory
 *   clearSemanticModelCache()              delete the cached model files from this browser
 *   getSemanticState() / subscribeSemantic(listener)   status + load progress for the UI
 *
 * Nothing loads until the clinician turns the feature on (loadSemanticModel). Suggestions are for the
 * clinician to tap and add ("Possible matches - on-device AI"), never added on their own.
 * The text is scrubbed again here (scrubPHI is idempotent) before it reaches the worker, and it never
 * leaves this browser tab: the worker fetches only same-origin static files.
 */
import { scrubPHI } from "../phi-scrubber";
import type { SemanticSuggestion, SuggestOptions } from "./core";
import { DOWNLOAD_ESTIMATE_BYTES } from "./model";
import {
  ERROR_MESSAGES,
  type LoadProgress,
  type SemanticErrorCode,
  type SemanticModelInfo,
  type WorkerRequest,
  type WorkerResponse,
} from "./protocol";

export type { SemanticSuggestion, SuggestOptions } from "./core";
export type { LoadProgress, SemanticErrorCode, SemanticModelInfo } from "./protocol";
export { DEFAULT_LIMIT, DEFAULT_THRESHOLD } from "./core";

/** Label the UI shows above the chips. */
export const SEMANTIC_SUGGESTIONS_LABEL = "Possible matches - on-device AI";
/** Approximate one-time download, in bytes, to show before the clinician turns the feature on. */
export const SEMANTIC_DOWNLOAD_BYTES =
  DOWNLOAD_ESTIMATE_BYTES.model + DOWNLOAD_ESTIMATE_BYTES.runtime + DOWNLOAD_ESTIMATE_BYTES.lexicon;
/** Cache Storage bucket transformers.js keeps the model files in (when cacheModel is true). */
export const MODEL_CACHE_NAME = "transformers-cache";

export type SemanticStatus = "off" | "unsupported" | "loading" | "ready" | "error";

export interface SemanticState {
  status: SemanticStatus;
  progress: LoadProgress | null;
  error: { code: SemanticErrorCode; message: string } | null;
  info: SemanticModelInfo | null;
}

export class SemanticError extends Error {
  constructor(readonly code: SemanticErrorCode) {
    super(ERROR_MESSAGES[code]);
    this.name = "SemanticError";
  }
}

/* ------------------------------------------------------------------ */
/* Support                                                             */
/* ------------------------------------------------------------------ */

const SIMD_PROBE = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]);

/** Feature check only: creates nothing, downloads nothing. */
export function semanticSupport(): { supported: true } | { supported: false; reason: string } {
  if (typeof window === "undefined") return { supported: false, reason: "Runs in the browser only." };
  if (typeof Worker === "undefined") return { supported: false, reason: ERROR_MESSAGES.unsupported };
  try {
    if (typeof WebAssembly !== "object" || !WebAssembly.validate(SIMD_PROBE)) {
      return { supported: false, reason: ERROR_MESSAGES.unsupported };
    }
  } catch {
    return { supported: false, reason: ERROR_MESSAGES.unsupported };
  }
  return { supported: true };
}

/* ------------------------------------------------------------------ */
/* State                                                               */
/* ------------------------------------------------------------------ */

const OFF: SemanticState = { status: "off", progress: null, error: null, info: null };
let state: SemanticState = OFF;
const listeners = new Set<(s: SemanticState) => void>();

function setState(next: Partial<SemanticState>): void {
  state = { ...state, ...next };
  for (const l of listeners) l(state);
}

export function getSemanticState(): SemanticState {
  return state;
}

/** Returns an unsubscribe function. Works with React's useSyncExternalStore. */
export function subscribeSemantic(listener: (s: SemanticState) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/* ------------------------------------------------------------------ */
/* Worker plumbing                                                     */
/* ------------------------------------------------------------------ */

let worker: Worker | null = null;
let nextId = 1;
let loadPromise: Promise<SemanticModelInfo> | null = null;
const pending = new Map<number, { resolve: (r: WorkerResponse) => void; reject: (e: SemanticError) => void }>();
const progressListeners = new Map<number, (p: LoadProgress) => void>();

function rejectAll(code: SemanticErrorCode): void {
  for (const p of pending.values()) p.reject(new SemanticError(code));
  pending.clear();
  progressListeners.clear();
}

function startWorker(): Worker {
  // The literal `new URL(..., import.meta.url)` lets the bundler emit the worker as its own chunk.
  const w = new Worker(new URL("./embedder.worker.ts", import.meta.url), { type: "module", name: "semantic-embedder" });
  w.addEventListener("message", (event: MessageEvent<WorkerResponse>) => {
    const msg = event.data;
    if (!msg || typeof msg !== "object") return;
    if (msg.type === "progress") {
      progressListeners.get(msg.id)?.(msg.progress);
      if (state.status === "loading") setState({ progress: msg.progress });
      return;
    }
    const p = pending.get(msg.id);
    if (!p) return;
    pending.delete(msg.id);
    progressListeners.delete(msg.id);
    if (msg.type === "error") p.reject(new SemanticError(msg.code));
    else p.resolve(msg);
  });
  // A worker that cannot start (old browser, blocked module worker, crash) ends here.
  w.addEventListener("error", (event) => {
    event.preventDefault();
    terminate();
    rejectAll("load-failed");
    setState({ status: "error", error: { code: "load-failed", message: ERROR_MESSAGES["load-failed"] }, progress: null });
  });
  return w;
}

function request(msg: WorkerRequest, onProgress?: (p: LoadProgress) => void): Promise<WorkerResponse> {
  const w = worker;
  if (!w) return Promise.reject(new SemanticError("not-loaded"));
  return new Promise((resolve, reject) => {
    pending.set(msg.id, { resolve, reject });
    if (onProgress) progressListeners.set(msg.id, onProgress);
    w.postMessage(msg);
  });
}

function terminate(): void {
  worker?.terminate();
  worker = null;
  loadPromise = null;
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

export interface LoadOptions {
  /**
   * Keep the downloaded model files in this browser's Cache Storage ("transformers-cache") so the next
   * session starts without downloading again. Model files only; never any clinical text. Default true.
   */
  cacheModel?: boolean;
  onProgress?: (p: LoadProgress) => void;
}

/**
 * Turn the feature on: start the worker and load the model, runtime and lexicon embeddings (same
 * origin only). Resolves when ready; rejects with SemanticError ("unsupported", "files-missing",
 * "load-failed"). Calling it again while loading or ready returns the same promise.
 */
export function loadSemanticModel(opts: LoadOptions = {}): Promise<SemanticModelInfo> {
  if (loadPromise) return loadPromise;
  const support = semanticSupport();
  if (!support.supported) {
    setState({ status: "unsupported", error: { code: "unsupported", message: support.reason }, progress: null, info: null });
    return Promise.reject(new SemanticError("unsupported"));
  }
  try {
    worker = startWorker();
  } catch {
    setState({ status: "unsupported", error: { code: "unsupported", message: ERROR_MESSAGES.unsupported }, progress: null, info: null });
    return Promise.reject(new SemanticError("unsupported"));
  }
  setState({ status: "loading", error: null, info: null, progress: { phase: "lexicon", loaded: 0, total: SEMANTIC_DOWNLOAD_BYTES, fraction: 0 } });
  const id = nextId++;
  const p = request({ type: "load", id, cacheModel: opts.cacheModel !== false }, opts.onProgress).then(
    (r) => {
      if (r.type !== "ready") throw new SemanticError("load-failed");
      setState({ status: "ready", info: r.info, progress: null, error: null });
      return r.info;
    },
    (err: unknown) => {
      const code = err instanceof SemanticError ? err.code : "load-failed";
      terminate();
      setState({ status: code === "unsupported" ? "unsupported" : "error", error: { code, message: ERROR_MESSAGES[code] }, progress: null });
      throw err instanceof SemanticError ? err : new SemanticError(code);
    },
  );
  loadPromise = p;
  return p;
}

export interface SemanticSuggestOptions extends SuggestOptions {
  /** Abort a stale request (for example, the clinician kept typing). Rejects with an AbortError. */
  signal?: AbortSignal;
}

/**
 * Possible lexicon matches for the clinician's text, computed on this device. Requires
 * loadSemanticModel() first (rejects with SemanticError "not-loaded"). `exclude` should hold the ids
 * already selected or matched by the deterministic matcher. Results are suggestions only.
 */
export async function semanticSuggest(scrubbedText: string, opts: SemanticSuggestOptions = {}): Promise<SemanticSuggestion[]> {
  if (!worker || !loadPromise) throw new SemanticError("not-loaded");
  await loadPromise;
  const text = scrubPHI(String(scrubbedText ?? "")).clean;
  if (!text.trim()) return [];
  const { signal, ...options } = opts;
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  const id = nextId++;
  const job = request({
    type: "suggest",
    id,
    text,
    options: { exclude: [...(options.exclude ?? [])], threshold: options.threshold, limit: options.limit, margin: options.margin },
  });
  const result = await (signal
    ? Promise.race([
        job,
        new Promise<never>((_, reject) =>
          signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true }),
        ),
      ])
    : job);
  if (result.type !== "result") throw new SemanticError("failed");
  return result.suggestions;
}

/** Turn the feature off: stop the worker (drops the model and every cached vector from memory). */
export function disableSemanticModel(): void {
  terminate();
  rejectAll("not-loaded");
  setState(OFF);
}

/** Drop the worker's in-memory cache of recent segment vectors (for example when a session is cleared). */
export async function clearSemanticMemory(): Promise<void> {
  if (!worker) return;
  await request({ type: "clear", id: nextId++ }).catch(() => undefined);
}

/**
 * Delete the model files transformers.js cached in this browser (Cache Storage "transformers-cache").
 * Holds model weights only. Returns true when something was deleted.
 */
export async function clearSemanticModelCache(): Promise<boolean> {
  if (typeof caches === "undefined") return false;
  try {
    return await caches.delete(MODEL_CACHE_NAME);
  } catch {
    return false;
  }
}
