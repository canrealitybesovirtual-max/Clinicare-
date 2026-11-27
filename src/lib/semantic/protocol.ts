/**
 * Messages between the page (client.ts) and the on-device embedder worker (embedder.worker.ts).
 * Messages carry scrubbed text and curated ids only, and stay inside this browser tab.
 * Error messages never contain clinical text.
 */
import type { SemanticSuggestion, SuggestOptions } from "./core";

export type LoadPhase = "lexicon" | "runtime" | "model" | "warmup";

export interface LoadProgress {
  phase: LoadPhase;
  /** Bytes received so far, all files together. */
  loaded: number;
  /** Bytes expected, all files together (an estimate until every file has reported its size). */
  total: number;
  /** 0-1. */
  fraction: number;
}

export interface SemanticModelInfo {
  model: string;
  revision: string;
  symptoms: number;
  phrases: number;
  threads: number;
  /** "wasm" (CPU, WebAssembly SIMD). */
  backend: "wasm";
}

export type SemanticErrorCode =
  | "unsupported" // no Web Worker / WebAssembly SIMD
  | "files-missing" // model, runtime or lexicon files not deployed (404)
  | "integrity" // a model or runtime file did not match its pinned SHA-256
  | "load-failed" // anything else while loading
  | "not-loaded" // suggest before the clinician turned the feature on
  | "failed"; // a suggest call failed

export type WorkerRequest =
  | { type: "load"; id: number; cacheModel: boolean }
  | { type: "suggest"; id: number; text: string; options: SuggestOptions }
  | { type: "clear"; id: number };

export type WorkerResponse =
  | { type: "progress"; id: number; progress: LoadProgress }
  | { type: "ready"; id: number; info: SemanticModelInfo }
  | { type: "result"; id: number; suggestions: SemanticSuggestion[] }
  | { type: "cleared"; id: number }
  | { type: "error"; id: number; code: SemanticErrorCode; message: string };

export const ERROR_MESSAGES: Readonly<Record<SemanticErrorCode, string>> = {
  unsupported: "This browser cannot run the on-device model (it needs Web Workers, WebAssembly SIMD and a secure HTTPS connection).",
  "files-missing": "The on-device model files are not installed on this server.",
  integrity: "The on-device model files on this server do not match their pinned checksums, so they were not used.",
  "load-failed": "The on-device model could not be loaded.",
  "not-loaded": "Turn on on-device suggestions first.",
  failed: "The on-device model could not process this text.",
};
