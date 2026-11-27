import type { Stat } from "./schemas";

/** G13: flag statistics whose data are older than 5 years. Pure, so client components can use it cheaply. */
export function isStatStale(stat: Pick<Stat, "dataYear">, now: Date = new Date()): boolean {
  const years = stat.dataYear.match(/\d{4}/g)?.map(Number) ?? [];
  if (years.length === 0) return true;
  return now.getFullYear() - Math.max(...years) > 5;
}
