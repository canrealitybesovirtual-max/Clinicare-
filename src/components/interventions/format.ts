/** Shared display helpers for interventions (pure; safe in server and client components). */
export function minutesLabel(m: { min: number; max: number }): string {
  return m.min === m.max ? `${m.min} min` : `${m.min}–${m.max} min`;
}
