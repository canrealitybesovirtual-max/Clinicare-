/**
 * Single source of truth for the on-device embedding model (see docs/ON-DEVICE-AI.md).
 * Imported by scripts/fetch-model.ts, scripts/build-lexicon-embeddings.ts, the Web Worker and tests.
 * No imports, no side effects: safe in Node, the browser and a worker (Web Crypto is used only when called).
 */

/** Hugging Face repo the ONNX files come from, and the exact commit they are pinned to. */
export const MODEL_HF_ID = "Xenova/all-MiniLM-L6-v2";
export const MODEL_REVISION = "751bff37182d3f1213fa05d7196b954e230abad9";

/** Folder name under public/models/ (also the model id transformers.js resolves under localModelPath). */
export const MODEL_NAME = "all-MiniLM-L6-v2";
export const MODEL_DIMS = 384;
/** transformers.js dtype: "q8" loads onnx/model_quantized.onnx (int8 weights). */
export const MODEL_DTYPE = "q8";

/** Same-origin URL paths used in the browser. Nothing is ever fetched from another origin. */
export const LOCAL_MODEL_PATH = "/models/";
export const ORT_WASM_PATH = "/ort/";
export const LEXICON_EMBEDDINGS_URL = "/models/lexicon-embeddings.json";

/**
 * onnxruntime-web files the worker loads from /ort/ (copied by scripts/copy-ort.ts). The plain SIMD
 * build (CPU only, optional threads) is half the size of the default WebGPU/asyncify build and is all a
 * 22M-parameter sentence encoder needs.
 */
export const ORT_FILES = ["ort-wasm-simd-threaded.mjs", "ort-wasm-simd-threaded.wasm"] as const;

/** Format tag of public/models/lexicon-embeddings.json. Bump when the file layout changes. */
export const LEXICON_EMBEDDINGS_FORMAT = "crc-lexicon-embeddings/1";

/**
 * Approximate one-time download when the clinician turns the feature on (uncompressed bytes): the model
 * files (scripts/fetch-model.ts MANIFEST), the onnxruntime-web WASM binary and the lexicon embeddings.
 * Used for progress bars and the "about 40 MB" notice; real sizes replace these as files arrive.
 */
export const DOWNLOAD_ESTIMATE_BYTES = {
  model: 23_685_047,
  runtime: 14_264_838,
  lexicon: 1_400_000,
} as const;

/* ------------------------------------------------------------------ */
/* Integrity pins (checked at build time AND again in the browser)      */
/* ------------------------------------------------------------------ */

export interface PinnedFile {
  /** Path inside public/models/<MODEL_NAME>/ (model files) or public/ort/ (runtime files). */
  path: string;
  bytes: number;
  sha256: string;
}

/**
 * Model files, pinned to MODEL_REVISION. scripts/fetch-model.ts refuses a download that does not match, and the
 * worker refuses a served file (or a Cache Storage copy) that does not match, so a stale, corrupted or swapped
 * file is never run. The ONNX hash is the Git LFS object id Hugging Face publishes for that commit.
 */
export const MODEL_FILES: readonly PinnedFile[] = [
  { path: "config.json", bytes: 650, sha256: "7135149f7cffa1a573466c6e4d8423ed73b62fd2332c575bf738a0d033f70df7" },
  { path: "tokenizer_config.json", bytes: 366, sha256: "9261e7d79b44c8195c1cada2b453e55b00aeb81e907a6664974b4d7776172ab3" },
  { path: "tokenizer.json", bytes: 711661, sha256: "da0e79933b9ed51798a3ae27893d3c5fa4a201126cef75586296df9b4d2c62a0" },
  { path: "onnx/model_quantized.onnx", bytes: 22972370, sha256: "afdb6f1a0e45b715d0bb9b11772f032c399babd23bfc31fed1c170afc848bdb1" },
];

/**
 * onnxruntime-web runtime files, pinned to the release @huggingface/transformers resolves (ORT_VERSION).
 * scripts/copy-ort.ts fails --check when node_modules holds a different build; update the version and both
 * hashes together after reviewing the new release.
 */
export const ORT_VERSION = "1.31.0-dev.20260914-8d85527a0";
export const ORT_PINS: readonly PinnedFile[] = [
  { path: "ort-wasm-simd-threaded.mjs", bytes: 24381, sha256: "c57ca56328877353a575e51bbca6f18450027d6c9bf2307a2cb2c41363b4de9f" },
  { path: "ort-wasm-simd-threaded.wasm", bytes: 14264838, sha256: "06ba057753da3847e4c24f02d91ab133455b0817c69a44993a9a53a2146df9e3" },
];

/** The pin for a same-origin URL path the worker loads ("/models/all-MiniLM-L6-v2/tokenizer.json", "/ort/..."), or null. */
export function pinFor(pathname: string): PinnedFile | null {
  const modelPrefix = `${LOCAL_MODEL_PATH}${MODEL_NAME}/`;
  if (pathname.startsWith(modelPrefix)) return MODEL_FILES.find((f) => f.path === pathname.slice(modelPrefix.length)) ?? null;
  if (pathname.startsWith(ORT_WASM_PATH)) return ORT_PINS.find((f) => f.path === pathname.slice(ORT_WASM_PATH.length)) ?? null;
  return null;
}

/** Lower-case hex SHA-256 with Web Crypto (browser, worker and Node 20+). */
export async function sha256Hex(bytes: ArrayBuffer | Uint8Array): Promise<string> {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", view as Uint8Array<ArrayBuffer>);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** True only when `bytes` is exactly the pinned file (size and SHA-256). */
export async function matchesPin(bytes: ArrayBuffer | Uint8Array, pin: PinnedFile): Promise<boolean> {
  if (bytes.byteLength !== pin.bytes) return false;
  return (await sha256Hex(bytes)) === pin.sha256;
}
