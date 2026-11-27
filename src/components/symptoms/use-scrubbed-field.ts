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

/* ------------------------------------------------------------------ pointer press tracking */

/**
 * A field loses focus on pointerdown, but the click lands on pointerup. Scrubbing at blur time shows a notice and
 * can move the button that is being pressed, so the click misses. Work that changes layout waits until the press
 * is over (and the click has been delivered); keyboard blurs and taps run right after the current event.
 */
let pressing = false;
let tracking = false;
const afterPress = new Set<() => void>();

function trackPointer(): void {
  if (tracking || typeof window === "undefined") return;
  tracking = true;
  const release = () => {
    pressing = false;
    const run = [...afterPress];
    afterPress.clear();
    setTimeout(() => run.forEach((fn) => fn()), 0); // after the click that follows pointerup
  };
  window.addEventListener("pointerdown", () => (pressing = true), { capture: true, passive: true });
  window.addEventListener("pointerup", release, { capture: true, passive: true });
  window.addEventListener("pointercancel", release, { capture: true, passive: true });
}

function whenNotPressing(fn: () => void): () => void {
  if (pressing) {
    afterPress.add(fn);
    return () => afterPress.delete(fn);
  }
  const t = setTimeout(fn, 0);
  return () => clearTimeout(t);
}

/* ------------------------------------------------------------------ hook */

/**
 * Live PHI scrubbing for a text field (G5). The raw value lives only in this component's state until it is
 * scrubbed: SCRUB_DEBOUNCE_MS after the last keystroke, on blur, or on an explicit flushNow(). When anything was
 * removed the field shows the clean text, and only the clean text is ever handed to `commit`.
 * Scrubs triggered by the timer or by blur wait for a pointer press in progress to finish (see trackPointer), so a
 * notice appearing under the field never makes a click on a nearby button miss.
 */
export function useScrubbedField<T extends HTMLInputElement | HTMLTextAreaElement>(
  committedValue: string,
  commit: (clean: string) => void,
) {
  const [draft, setDraftState] = React.useState(committedValue);
  const [removed, setRemoved] = React.useState<RemovedSummary | null>(null);
  const [alertKey, setAlertKey] = React.useState(0);
  const last = React.useRef(committedValue);
  const draftRef = React.useRef(committedValue);
  const ref = React.useRef<T>(null);
  const pendingCaret = React.useRef<number | null>(null);
  const commitRef = React.useRef(commit);
  React.useEffect(() => {
    commitRef.current = commit;
  });
  React.useEffect(trackPointer, []);

  const setDraft = React.useCallback((value: string) => {
    draftRef.current = value;
    setDraftState(value);
  }, []);

  // External changes (Clear session, idle reset, examples) flow back into the field.
  React.useEffect(() => {
    if (committedValue !== last.current) {
      last.current = committedValue;
      setDraft(committedValue);
      if (!committedValue) setRemoved(null);
    }
  }, [committedValue, setDraft]);

  const flush = React.useCallback(
    (raw: string, force = false) => {
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
    },
    [setDraft],
  );

  /** Scrub the latest draft if it changed (reads the ref, so a deferred call never uses a stale value). */
  const flushLatest = React.useCallback(() => {
    if (draftRef.current !== last.current) flush(draftRef.current);
  }, [flush]);

  React.useEffect(() => {
    if (draft === last.current) return;
    let cancel = () => {};
    const t = setTimeout(() => (cancel = whenNotPressing(flushLatest)), SCRUB_DEBOUNCE_MS);
    return () => {
      clearTimeout(t);
      cancel();
    };
  }, [draft, flushLatest]);

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
    /** Scrub and commit now (submit, navigation). */
    flushNow: flushLatest,
    /** For onBlur: scrub and commit once any pointer press in progress is over. */
    onBlur: React.useCallback(() => {
      whenNotPressing(flushLatest);
    }, [flushLatest]),
    /** Replace the whole value (examples, clear). Still scrubbed. */
    replace: (raw: string) => flush(raw, true),
    removed,
    alertKey,
    dismissRemoved: () => setRemoved(null),
  };
}
