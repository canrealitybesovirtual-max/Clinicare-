"use client";
/**
 * Memory-only state the AI helpers share between the Symptom Finder and the Diagnoses screen (G5):
 *  - follow-up answers: curated question and answer ids, plus the curated question text and answer labels shown
 *    back to the clinician (question text is templated with dictionary labels, never with typed words);
 *  - the per-session opt-in for the optional Claude assistant and its server-sealed answer history.
 *
 * Module memory only: never storage, URL, cookie or log. Everything is tied to the session's `resetCount`, so
 * Clear session and the idle wipe make it read as empty at once; the stale values are dropped (and the on-device
 * model is switched off) the next time a screen that uses this store mounts.
 */
import * as React from "react";
import type { AnsweredRecord } from "@/lib/follow-up";
import { disableSemanticModel } from "@/lib/semantic/client";
import { useSession } from "@/state/session";

/** A follow-up answer as the panel shows it back. Curated strings only. */
export interface FollowUpAnswer extends AnsweredRecord {
  questionText: string;
  answerLabels: string[];
}

/** Exactly as /api/assistant returned it; sent back unchanged (the server checks the seal). */
export interface AssistantAnswered {
  questionId: string;
  questionText: string;
  answerLabel: string;
  seal: string;
}

interface AiSessionState {
  epoch: number;
  followUpAnswers: readonly FollowUpAnswer[];
  assistantOptIn: boolean;
  /** The server said the assistant is not configured: hide it for the rest of this session. */
  assistantUnavailable: boolean;
  assistantAnswered: readonly AssistantAnswered[];
}

const fresh = (epoch: number): AiSessionState => ({
  epoch,
  followUpAnswers: [],
  assistantOptIn: false,
  assistantUnavailable: false,
  assistantAnswered: [],
});

let store: AiSessionState = fresh(0);
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};
const getSnapshot = () => store;
const SERVER_SNAPSHOT = fresh(0);

/** Per-epoch empty states, so readers get a stable object while a reset is pending. */
const emptyByEpoch = new Map<number, AiSessionState>();
function emptyFor(epoch: number): AiSessionState {
  let e = emptyByEpoch.get(epoch);
  if (!e) {
    emptyByEpoch.clear();
    e = fresh(epoch);
    emptyByEpoch.set(epoch, e);
  }
  return e;
}

export type AiSessionPatch = Partial<Omit<AiSessionState, "epoch">>;

export function useAiSession(): [AiSessionState, (patch: AiSessionPatch | ((prev: AiSessionState) => AiSessionPatch)) => void] {
  const { resetCount } = useSession();
  const snap = React.useSyncExternalStore(subscribe, getSnapshot, () => SERVER_SNAPSHOT);
  const current = snap.epoch === resetCount ? snap : emptyFor(resetCount);

  React.useEffect(() => {
    if (store.epoch === resetCount) return;
    store = fresh(resetCount);
    disableSemanticModel(); // the worker keeps recent clause vectors; a new session starts with it off
    for (const l of listeners) l();
  }, [resetCount]);

  const update = React.useCallback(
    (patch: AiSessionPatch | ((prev: AiSessionState) => AiSessionPatch)) => {
      const base = store.epoch === resetCount ? store : fresh(resetCount);
      store = { ...base, ...(typeof patch === "function" ? patch(base) : patch), epoch: resetCount };
      for (const l of listeners) l();
    },
    [resetCount],
  );
  return [current, update];
}
