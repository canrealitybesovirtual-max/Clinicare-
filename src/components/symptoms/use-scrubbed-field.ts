"use client";
import * as React from "react";
import { scrubPHI, summarizeFindings } from "@/lib/phi-scrubber";
import type { PhiFinding, PhiType } from "@/lib/types";

export const SCRUB_DEBOUNCE_MS = 500;

export type RemovedSummary = { type: PhiType; label: string; count: number }[];

/** Where the caret should land after findings are swapped for `[TYPE]` placeholders. */
export function mapCaret(pos: number, findings: readonly PhiFinding[]): number {
  let delta = 0;
  for (const f of [...findings].sort((a, b) => a.start - b.start)) {
    const placeholder = f.type.length + 2;
    if (f.end <= pos) delta += placeholder - (f.end - f.start);
    else if (f.start < pos) return f.start + delta + placeholder;
    else break;
  }
  return pos + delta;
}

/**
 * Live PHI scrubbing for a text field (G5). The raw value lives only in this component's state for
 * at most SCRUB_DEBOUNCE_MS; after that (or on blur) it is scrubbed, the field shows the clean text
 * when anything was removed, and only the clean text is handed to `commit`.
 */
export function useScrubbedField<T extends HTMLInputElement | HTMLTextAreaElement>(
  committedValue: string,
  commit: (clean: string) => void,
) {
  const [draft, setDraft] = React.useState(committedValue);
  const [removed, setRemoved] = React.useState<RemovedSummary | null>(null);
  const [alertKey, setAlertKey] = React.useState(0);
  const last = React.useRef(committedValue);
  const ref = React.useRef<T>(null);
  const pendingCaret = React.useRef<number | null>(null);
  const commitRef = React.useRef(commit);
  React.useEffect(() => {
    commitRef.current = commit;
  });

  // External changes (Clear session, idle reset, examples) flow back into the field.
  React.useEffect(() => {
    if (committedValue !== last.current) {
      last.current = committedValue;
      setDraft(committedValue);
      if (!committedValue) setRemoved(null);
    }
  }, [committedValue]);

  const flush = React.useCallback((raw: string, force = false) => {
    const { clean, findings } = scrubPHI(raw);
    if (findings.length === 0 && force) setRemoved(null);
    if (findings.length > 0) {
      setRemoved(summarizeFindings(findings));
      setAlertKey((k) => k + 1);
      const el = ref.current;
      if (el && typeof document !== "undefined" && document.activeElement === el) {
        pendingCaret.current = mapCaret(el.selectionStart ?? raw.length, findings);
      }
    }
    if (findings.length > 0 || force) setDraft(clean);
    last.current = clean;
    commitRef.current(clean);
  }, []);

  React.useEffect(() => {
    if (draft === last.current) return;
    const t = setTimeout(() => flush(draft), SCRUB_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [draft, flush]);

  React.useLayoutEffect(() => {
    const pos = pendingCaret.current;
    if (pos !== null && ref.current) {
      ref.current.setSelectionRange(pos, pos);
      pendingCaret.current = null;
    }
  }, [draft]);

  return {
    ref,
    draft,
    setDraft,
    /** Scrub and commit now (blur, navigation). */
    flushNow: () => {
      if (draft !== last.current) flush(draft);
    },
    /** Replace the whole value (examples, clear). Still scrubbed. */
    replace: (raw: string) => flush(raw, true),
    removed,
    alertKey,
    dismissRemoved: () => setRemoved(null),
  };
}
