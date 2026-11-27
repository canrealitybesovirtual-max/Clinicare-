/**
 * Session flow timer (tools/session): a simple agenda with planned minutes per step. Pure: no React, no clock.
 * The screen passes elapsed milliseconds in; nothing is typed, stored or sent.
 */

export interface FlowStep {
  id: string;
  label: string;
  minutes: number;
  hint: string;
}

/** A common structure for a 50-minute outpatient session (adjustable on screen). */
export const DEFAULT_FLOW: readonly FlowStep[] = [
  { id: "check-in", label: "Check-in", minutes: 5, hint: "How the week went. Anything urgent, including safety, comes first." },
  { id: "measure", label: "Measure", minutes: 5, hint: "A quick GAD-7 or PHQ-9 and a look at the trend together." },
  { id: "agenda", label: "Agenda", minutes: 5, hint: "Agree on one or two topics for today." },
  { id: "practice", label: "Intervention practice", minutes: 20, hint: "Work on the main topic and practice the skill in session." },
  { id: "homework", label: "Homework", minutes: 7, hint: "Plan one small, doable step for the week." },
  { id: "wrap-up", label: "Wrap-up", minutes: 8, hint: "Summary, the client's feedback, and next steps." },
];

export const STEP_MIN_MINUTES = 1;
export const STEP_MAX_MINUTES = 60;

export function plannedMs(steps: readonly FlowStep[]): number {
  return steps.reduce((n, s) => n + s.minutes, 0) * 60_000;
}

export interface FlowStatus {
  /** Time left in the current step (0 once it runs over). */
  stepRemainingMs: number;
  /** How far the current step has run past its planned minutes. */
  stepOverMs: number;
  /** Time left in the whole planned session (0 once it runs over). */
  sessionRemainingMs: number;
  /** Projected overrun at the end if the remaining steps keep their planned minutes. */
  projectedOverMs: number;
}

/**
 * Where the session stands. `stepStartMs` is the elapsed time at which the current step began (steps move on when
 * the clinician says so, not automatically).
 */
export function flowStatus(steps: readonly FlowStep[], stepIndex: number, elapsedMs: number, stepStartMs: number): FlowStatus {
  const step = steps[stepIndex];
  const stepPlanned = (step?.minutes ?? 0) * 60_000;
  const inStep = Math.max(0, elapsedMs - stepStartMs);
  const later = steps.slice(stepIndex + 1).reduce((n, s) => n + s.minutes * 60_000, 0);
  const total = plannedMs(steps);
  return {
    stepRemainingMs: Math.max(0, stepPlanned - inStep),
    stepOverMs: Math.max(0, inStep - stepPlanned),
    sessionRemainingMs: Math.max(0, total - elapsedMs),
    projectedOverMs: Math.max(0, elapsedMs + Math.max(0, stepPlanned - inStep) + later - total),
  };
}

/** "12:05" (minutes:seconds); hours roll into minutes ("75:00"). Rounds up so a running clock never shows 0:00 early. */
export function formatClock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Spoken form for screen readers: "12 minutes 5 seconds". */
export function spokenClock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  const parts = [];
  if (m) parts.push(`${m} minute${m === 1 ? "" : "s"}`);
  if (r || !m) parts.push(`${r} second${r === 1 ? "" : "s"}`);
  return parts.join(" ");
}
