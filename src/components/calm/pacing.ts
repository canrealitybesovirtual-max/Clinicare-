/** Pure timing for the Calm exercises. No React, no clock: callers pass elapsed milliseconds. */

export interface BreathState {
  phase: "in" | "out";
  /** Whole seconds left in this phase (counts down to 1). */
  secondsLeft: number;
  /** Breaths finished so far. */
  breaths: number;
}

export function breathState(elapsedMs: number, inhale: number, exhale: number): BreathState {
  const cycle = (inhale + exhale) * 1000;
  const t = Math.max(0, elapsedMs) % cycle;
  const inPhase = t < inhale * 1000;
  const left = inPhase ? inhale * 1000 - t : cycle - t;
  return { phase: inPhase ? "in" : "out", secondsLeft: Math.max(1, Math.ceil(left / 1000)), breaths: Math.floor(Math.max(0, elapsedMs) / cycle) };
}

export interface RelaxState {
  /** Index of the muscle group, or the group count when finished. */
  group: number;
  phase: "tighten" | "release" | "done";
  secondsLeft: number;
}

export function relaxState(elapsedMs: number, groups: number, tighten: number, release: number): RelaxState {
  const per = (tighten + release) * 1000;
  const t = Math.max(0, elapsedMs);
  const group = Math.floor(t / per);
  if (group >= groups) return { group: groups, phase: "done", secondsLeft: 0 };
  const inGroup = t - group * per;
  const tight = inGroup < tighten * 1000;
  const left = tight ? tighten * 1000 - inGroup : per - inGroup;
  return { group, phase: tight ? "tighten" : "release", secondsLeft: Math.max(1, Math.ceil(left / 1000)) };
}
