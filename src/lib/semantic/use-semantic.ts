"use client";
/**
 * React bindings for the on-device semantic matcher (client.ts). See docs/ON-DEVICE-AI.md for wiring.
 *
 *   const model = useSemanticModel();                       // { state, support, enable, disable, clearCache }
 *   const { suggestions, pending } = useSemanticSuggestions(scrubbedText, { exclude, enabled: model.state.status === "ready" });
 *
 * State lives in memory only. Suggestions are tap-to-add; nothing is added automatically.
 */
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  clearSemanticModelCache,
  disableSemanticModel,
  getSemanticState,
  loadSemanticModel,
  semanticSuggest,
  semanticSupport,
  subscribeSemantic,
  type LoadOptions,
  type SemanticState,
  type SemanticSuggestion,
} from "./client";

const SERVER_STATE: SemanticState = { status: "off", progress: null, error: null, info: null };

export function useSemanticModel(): {
  state: SemanticState;
  support: ReturnType<typeof semanticSupport>;
  enable: (opts?: LoadOptions) => Promise<void>;
  disable: () => void;
  clearCache: () => Promise<boolean>;
} {
  const state = useSyncExternalStore(subscribeSemantic, getSemanticState, () => SERVER_STATE);
  const [support, setSupport] = useState<ReturnType<typeof semanticSupport>>({ supported: false, reason: "Checking..." });
  useEffect(() => setSupport(semanticSupport()), []);
  const enable = useCallback(async (opts?: LoadOptions) => {
    await loadSemanticModel(opts).then(
      () => undefined,
      () => undefined, // the error is in `state.error`
    );
  }, []);
  const clearCache = useCallback(async () => {
    disableSemanticModel();
    return clearSemanticModelCache();
  }, []);
  return { state, support, enable, disable: disableSemanticModel, clearCache };
}

export interface UseSemanticSuggestionsOptions {
  /** Run only while true (pass `state.status === "ready"`). */
  enabled: boolean;
  /** Ids already selected or matched deterministically. */
  exclude?: readonly string[];
  threshold?: number;
  limit?: number;
  /** Wait this long after the last keystroke. Default 400 ms. */
  debounceMs?: number;
}

/**
 * Debounced on-device suggestions for `scrubbedText`. Stale requests are aborted, so the list always
 * belongs to the latest text. Returns [] while disabled.
 */
export function useSemanticSuggestions(
  scrubbedText: string,
  { enabled, exclude = [], threshold, limit, debounceMs = 400 }: UseSemanticSuggestionsOptions,
): { suggestions: SemanticSuggestion[]; pending: boolean; error: boolean } {
  const [suggestions, setSuggestions] = useState<SemanticSuggestion[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  // Ids are kebab-case slugs, so "|" never occurs inside one.
  const excludeKey = useMemo(() => [...new Set(exclude)].sort().join("|"), [exclude]);

  useEffect(() => {
    if (!enabled || !scrubbedText.trim()) {
      setSuggestions([]);
      setPending(false);
      setError(false);
      return;
    }
    const ctrl = new AbortController();
    setPending(true);
    const timer = setTimeout(() => {
      const ids = excludeKey ? excludeKey.split("|") : [];
      semanticSuggest(scrubbedText, { exclude: ids, threshold, limit, signal: ctrl.signal }).then(
        (r) => {
          if (ctrl.signal.aborted) return;
          setSuggestions(r);
          setError(false);
          setPending(false);
        },
        (err: unknown) => {
          if (ctrl.signal.aborted || (err instanceof DOMException && err.name === "AbortError")) return;
          setSuggestions([]);
          setError(true);
          setPending(false);
        },
      );
    }, debounceMs);
    return () => {
      ctrl.abort();
      clearTimeout(timer);
    };
  }, [enabled, scrubbedText, excludeKey, threshold, limit, debounceMs]);

  return { suggestions, pending, error };
}
