"use client";
/**
 * Memory-only session state (G5). Nothing here is written to any browser storage, URL, cookie or log.
 * Wiped on reload/close (it only lives in React memory) and after IDLE_MS without interaction.
 * Free text stored here has ALREADY passed the PHI scrubber.
 */
import * as React from "react";
import type { DurationBand, Onset, TriState } from "@/lib/types";

export const IDLE_MS = 15 * 60 * 1000;

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
}

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
};

type Action =
  | { type: "set"; patch: Partial<SessionState> }
  | { type: "toggleSymptom"; id: string }
  | { type: "answer"; measureId: string; index: number; value: number | null; itemCount: number }
  | { type: "functional"; measureId: string; value: number | null }
  | { type: "clearMeasure"; measureId: string }
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
  reset: () => void;
  idleCleared: boolean;
  dismissIdleNotice: () => void;
}

const Ctx = React.createContext<SessionCtx | null>(null);

export function SessionProvider({ children, idleMs = IDLE_MS }: { children: React.ReactNode; idleMs?: number }) {
  const [state, dispatch] = React.useReducer(reducer, initialSession);
  const [idleCleared, setIdleCleared] = React.useState(false);

  React.useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const arm = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        dispatch({ type: "reset", keepCountry: true });
        setIdleCleared(true);
      }, idleMs);
    };
    const events = ["pointerdown", "keydown", "scroll", "touchstart"] as const;
    events.forEach((e) => window.addEventListener(e, arm, { passive: true }));
    arm();
    return () => {
      clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, arm));
    };
  }, [idleMs]);

  const value = React.useMemo<SessionCtx>(
    () => ({
      state,
      set: (patch) => dispatch({ type: "set", patch }),
      toggleSymptom: (id) => dispatch({ type: "toggleSymptom", id }),
      answer: (measureId, index, value, itemCount) => dispatch({ type: "answer", measureId, index, value, itemCount }),
      setFunctional: (measureId, value) => dispatch({ type: "functional", measureId, value }),
      clearMeasure: (measureId) => dispatch({ type: "clearMeasure", measureId }),
      reset: () => dispatch({ type: "reset", keepCountry: true }),
      idleCleared,
      dismissIdleNotice: () => setIdleCleared(false),
    }),
    [state, idleCleared],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): SessionCtx {
  const ctx = React.useContext(Ctx);
  if (!ctx) throw new Error("useSession must be used inside <SessionProvider>");
  return ctx;
}
