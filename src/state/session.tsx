"use client";
/**
 * Memory-only session state (G5). Nothing here is written to any browser storage, URL, cookie or log.
 * Wiped on reload/close (it only lives in React memory) and after IDLE_MS without interaction.
 * Free text stored here has ALREADY passed the PHI scrubber.
 * Components that keep their own text state (search boxes, field drafts) remount on `resetCount`, so
 * Clear session and the idle wipe clear them as well. Module-level memory outside React (src/components/ai/
 * ai-session.ts) registers with onSessionReset() and is cleared at the same moment, on whatever page is open.
 */
import * as React from "react";
import type { DurationBand, Onset, TriState } from "@/lib/types";
import type { PlanDraft } from "@/components/plan/plan-model";

export const IDLE_MS = 15 * 60 * 1000;
/** How long before the idle wipe the "Keep working" warning appears (WCAG 2.2.1: warn and allow extending). */
export const IDLE_WARNING_MS = 60 * 1000;

export interface SessionState {
  symptomText: string; // scrubbed text only
  selectedSymptomIds: string[]; // chips chosen by the clinician
  duration: DurationBand;
  onset: Onset;
  impairment: TriState;
  substancePossible: TriState;
  medicalPossible: TriState;
  under18: boolean; // G12: adult-only scope
  country: string; // crisis-line country (ISO-2), not client data
  measureAnswers: Record<string, (number | null)[]>;
  measureFunctional: Record<string, number | null>;
  /** Treatment plan draft (screen 4). Scrubbed wording only; cleared by Clear session and the idle wipe. */
  plan: PlanDraft | null;
}

/** New plan value, or an updater that receives the latest draft (safe for debounced, scrubbed commits). */
export type PlanUpdate = PlanDraft | null | ((prev: PlanDraft | null) => PlanDraft | null);

export const initialSession: SessionState = {
  symptomText: "",
  selectedSymptomIds: [],
  duration: "unknown",
  onset: "unknown",
  impairment: "unknown",
  substancePossible: "unknown",
  medicalPossible: "unknown",
  under18: false,
  country: "US",
  measureAnswers: {},
  measureFunctional: {},
  plan: null,
};

type Action =
  | { type: "set"; patch: Partial<SessionState> }
  | { type: "toggleSymptom"; id: string }
  | { type: "answer"; measureId: string; index: number; value: number | null; itemCount: number }
  | { type: "functional"; measureId: string; value: number | null }
  | { type: "clearMeasure"; measureId: string }
  | { type: "plan"; update: PlanUpdate }
  | { type: "reset"; keepCountry?: boolean };

function reducer(state: SessionState, action: Action): SessionState {
  switch (action.type) {
    case "set":
      return { ...state, ...action.patch };
    case "toggleSymptom": {
      const has = state.selectedSymptomIds.includes(action.id);
      return {
        ...state,
        selectedSymptomIds: has
          ? state.selectedSymptomIds.filter((s) => s !== action.id)
          : [...state.selectedSymptomIds, action.id],
      };
    }
    case "answer": {
      const prev = state.measureAnswers[action.measureId] ?? Array<number | null>(action.itemCount).fill(null);
      const next = prev.slice();
      next[action.index] = action.value;
      return { ...state, measureAnswers: { ...state.measureAnswers, [action.measureId]: next } };
    }
    case "functional":
      return { ...state, measureFunctional: { ...state.measureFunctional, [action.measureId]: action.value } };
    case "clearMeasure": {
      const { [action.measureId]: _a, ...answers } = state.measureAnswers;
      const { [action.measureId]: _f, ...functional } = state.measureFunctional;
      return { ...state, measureAnswers: answers, measureFunctional: functional };
    }
    case "plan": {
      const next = typeof action.update === "function" ? action.update(state.plan) : action.update;
      return next === state.plan ? state : { ...state, plan: next };
    }
    case "reset":
      return { ...initialSession, country: action.keepCountry ? state.country : initialSession.country };
  }
}

interface SessionCtx {
  state: SessionState;
  set: (patch: Partial<SessionState>) => void;
  toggleSymptom: (id: string) => void;
  answer: (measureId: string, index: number, value: number | null, itemCount: number) => void;
  setFunctional: (measureId: string, value: number | null) => void;
  clearMeasure: (measureId: string) => void;
  /** Replace or update the treatment plan draft (memory only). */
  updatePlan: (update: PlanUpdate) => void;
  reset: () => void;
  idleCleared: boolean;
  dismissIdleNotice: () => void;
  /** True during the last IDLE_WARNING_MS before the idle wipe. */
  idleWarning: boolean;
  /** Restart the idle timer (the "Keep working" button). */
  extend: () => void;
  /** Increments on every reset (Clear session or idle wipe). Key local UI state on it so it clears too. */
  resetCount: number;
}

const Ctx = React.createContext<SessionCtx | null>(null);

const resetListeners = new Set<(resetCount: number) => void>();

/**
 * Runs `fn` with the new resetCount right after every Clear session and idle wipe, whichever screen is open.
 * For memory kept outside React state; returns the unsubscribe function.
 */
export function onSessionReset(fn: (resetCount: number) => void): () => void {
  resetListeners.add(fn);
  return () => {
    resetListeners.delete(fn);
  };
}

export function SessionProvider({ children, idleMs = IDLE_MS }: { children: React.ReactNode; idleMs?: number }) {
  const [state, dispatch] = React.useReducer(reducer, initialSession);
  const [idleCleared, setIdleCleared] = React.useState(false);
  const [idleWarning, setIdleWarning] = React.useState(false);
  const [resetCount, setResetCount] = React.useState(0);
  const resetCountRef = React.useRef(0);
  const armRef = React.useRef<() => void>(() => {});
  /** Clear session and the idle wipe: empty the session, bump resetCount, tell outside-React memory. */
  const resetAll = React.useCallback(() => {
    dispatch({ type: "reset", keepCountry: true });
    const next = ++resetCountRef.current;
    setResetCount(next);
    for (const fn of resetListeners) fn(next);
  }, []);

  React.useEffect(() => {
    let warnTimer: ReturnType<typeof setTimeout> | undefined;
    let wipeTimer: ReturnType<typeof setTimeout> | undefined;
    let last = Date.now();
    // Warn a minute ahead (or halfway, for very short test timeouts).
    const warnAfter = idleMs - Math.min(IDLE_WARNING_MS, Math.floor(idleMs / 2));
    const wipe = () => {
      clearTimeout(warnTimer);
      clearTimeout(wipeTimer);
      resetAll();
      setIdleWarning(false);
      setIdleCleared(true);
    };
    const arm = () => {
      last = Date.now();
      clearTimeout(warnTimer);
      clearTimeout(wipeTimer);
      setIdleWarning(false);
      warnTimer = setTimeout(() => setIdleWarning(true), warnAfter);
      wipeTimer = setTimeout(wipe, idleMs);
    };
    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      // Background tabs can delay timers: if the idle time already passed while hidden, clear now.
      if (Date.now() - last >= idleMs) wipe();
      else arm();
    };
    armRef.current = arm;
    // focusin covers keyboard and screen-reader navigation that produces no keydown on the page.
    const events = ["pointerdown", "keydown", "scroll", "touchstart", "focusin"] as const;
    events.forEach((e) => window.addEventListener(e, arm, { passive: true }));
    document.addEventListener("visibilitychange", onVisibility);
    arm();
    return () => {
      clearTimeout(warnTimer);
      clearTimeout(wipeTimer);
      armRef.current = () => {};
      events.forEach((e) => window.removeEventListener(e, arm));
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [idleMs, resetAll]);

  const value = React.useMemo<SessionCtx>(
    () => ({
      state,
      set: (patch) => dispatch({ type: "set", patch }),
      toggleSymptom: (id) => dispatch({ type: "toggleSymptom", id }),
      answer: (measureId, index, value, itemCount) => dispatch({ type: "answer", measureId, index, value, itemCount }),
      setFunctional: (measureId, value) => dispatch({ type: "functional", measureId, value }),
      clearMeasure: (measureId) => dispatch({ type: "clearMeasure", measureId }),
      updatePlan: (update) => dispatch({ type: "plan", update }),
      reset: resetAll,
      idleCleared,
      dismissIdleNotice: () => setIdleCleared(false),
      idleWarning,
      extend: () => armRef.current(),
      resetCount,
    }),
    [state, idleCleared, idleWarning, resetCount, resetAll],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): SessionCtx {
  const ctx = React.useContext(Ctx);
  if (!ctx) throw new Error("useSession must be used inside <SessionProvider>");
  return ctx;
}
