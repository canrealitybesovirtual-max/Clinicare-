/**
 * Display helpers for the clinician medication reference. Pure and isomorphic; no medication data is imported here,
 * so client components stay small (the server passes slim list items as props).
 */
import type { Medication, MedicationCategory } from "@/lib/schemas-medications";

/** Shown on every medication screen and with every live label. */
export const NOT_FOR_PRESCRIBING = "Not for prescribing decisions; consult the full prescribing information.";

/** "fluoxetine" -> "Fluoxetine"; "dextromethorphan and bupropion" -> "Dextromethorphan and bupropion". */
export function displayGeneric(generic: string): string {
  return generic.charAt(0).toUpperCase() + generic.slice(1);
}

const ROMAN: Record<string, string> = { CII: "II", CIII: "III", CIV: "IV", CV: "V" };

/** "CIV" -> "DEA Schedule IV (C-IV)". */
export function deaLabel(schedule: string): string {
  const r = ROMAN[schedule] ?? schedule.replace(/^C/, "");
  return `DEA Schedule ${r} (C-${r})`;
}

/** Substance-use treatment relevance: the curated flag, or an alcohol use disorder medication. */
export function isSudMedication(m: Pick<Medication, "sudRelated" | "category">): boolean {
  return m.sudRelated === true || m.category === "aud";
}

/** Slim, client-safe list item (no notes, label queries or links). */
export interface MedicationListItem {
  id: string;
  name: string;
  category: MedicationCategory;
  className: string;
  brands: string[];
  /** Extra search terms: combination and former brand names. */
  aliases: string[];
  boxedWarning: boolean;
  deaSchedule: string | null;
  sud: boolean;
}

export function toListItem(m: Medication): MedicationListItem {
  return {
    id: m.id,
    name: displayGeneric(m.generic),
    category: m.category,
    className: m.class,
    brands: [...m.commonBrands],
    aliases: [...(m.combinationBrands ?? []), ...(m.formerBrands ?? [])],
    boxedWarning: m.boxedWarning,
    deaSchedule: m.deaSchedule ?? null,
    sud: isSudMedication(m),
  };
}

/** Case-insensitive match on generic, brand, former/combination brand and class names. Empty query matches all. */
export function matchesMedication(item: MedicationListItem, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [item.name, item.className, ...item.brands, ...item.aliases].some((s) => s.toLowerCase().includes(q));
}
