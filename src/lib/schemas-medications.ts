/**
 * Content contract + loader for content/medications.json (clinician mode only).
 *
 * Purpose: education for medication-REFERRAL conversations. Never prescribing, dosing, switching or tapering advice
 * (G4: medication questions are routed to a prescriber). Wording is original (G1/G2); FDA label facts are summarised,
 * not copied. Governance lives at file level (G10): sources[], license "original", lastVerified, reviewedBy.
 *
 * Isomorphic (no server-only): the UI may import the list, the outbound validator and the link-out builders.
 * Outbound (G5, G17): the only medication values that may leave the app are the curated generic names / ids below
 * (and, server-side, the curated RxNorm / openFDA query names stored with each entry).
 *
 * Client mode (G3): do not render this content in client mode. `usedFor` names conditions.
 * Part 2 (G6): entries with sudRelated=true must show the 42 CFR Part 2 reminder in any export.
 */
import { z } from "zod";
import medicationsJson from "@content/medications.json";
import { curated } from "./outbound";
import { governance, slug } from "./schemas";

/* ---------------- field validators ---------------- */
/** Lower-case generic name as sent upstream: letters, spaces, hyphens ("dextromethorphan and bupropion"). */
export const GenericName = z.string().regex(/^[a-z][a-z -]{1,58}[a-z]$/, "lower-case generic name");
/** RxNorm ingredient / multiple-ingredient name, e.g. "bupropion / dextromethorphan". */
export const RxNormName = z.string().regex(/^[a-z][a-z /-]{1,78}[a-z]$/, "RxNorm ingredient name");
/** Brand name as printed (also the openFDA brand_name.exact value): letters, digits, space . ' - */
export const BrandName = z.string().regex(/^[A-Za-z][A-Za-z0-9 .'-]{0,39}$/, "brand name");
export const Rxcui = z.string().regex(/^\d{1,10}$/, "RxCUI");

export const MEDICATION_CATEGORIES = [
  "antidepressant",
  "anxiolytic",
  "hypnotic",
  "mood-stabilizer",
  "antipsychotic",
  "aud",
  "adhd",
  "other",
] as const;
export const MedicationCategory = z.enum(MEDICATION_CATEGORIES);
export type MedicationCategory = z.infer<typeof MedicationCategory>;

export const MEDICATION_CATEGORY_LABELS: Record<MedicationCategory, string> = {
  antidepressant: "Antidepressants and rapid-acting depression treatments",
  anxiolytic: "Anxiety medications",
  hypnotic: "Sleep medications",
  "mood-stabilizer": "Mood stabilizers",
  antipsychotic: "Antipsychotics",
  aud: "Alcohol use disorder medications",
  adhd: "ADHD medications",
  other: "Other (adjunctive or movement-effect treatments)",
};

/** openFDA `openfda.route` values used by the curated label queries. */
export const LABEL_ROUTES = ["ORAL", "NASAL", "TRANSDERMAL", "SUBLINGUAL", "INTRAVENOUS", "INTRAMUSCULAR"] as const;
export const LabelRoute = z.enum(LABEL_ROUTES);

export const DEA_SCHEDULES = ["CII", "CIII", "CIV", "CV"] as const;

export const UsedForSchema = z.strictObject({
  label: z.string().min(3).max(160), // original short phrase, never DSM text
  status: z.enum(["fda-approved", "off-label"]), // US labeling status
  conditionId: slug.optional(), // links to content/conditions/<id>.json when one exists
});
export type UsedFor = z.infer<typeof UsedForSchema>;

/**
 * How the server finds the current FDA label (see src/server/integrations/openfda.ts).
 * brand: reference brand (exact openFDA brand_name), tried first. name: openFDA generic-name phrase (default `generic`).
 * route: default ORAL. exclude: drop combination products naming these ingredients. combination: the product itself
 * is a combination (skip the single-ingredient filter). unharmonized: label lacks openFDA fields; search product data.
 */
export const LabelQuerySchema = z.strictObject({
  brand: BrandName.optional(),
  name: GenericName.optional(),
  route: LabelRoute.optional(),
  exclude: z.array(GenericName).max(4).optional(),
  combination: z.boolean().optional(),
  unharmonized: z.boolean().optional(),
});
export type LabelQuery = z.infer<typeof LabelQuerySchema>;

const medlinePlusDrugUrl = z
  .string()
  .regex(/^https:\/\/medlineplus\.gov\/druginfo\/meds\/a\d{6}\.html$/, "MedlinePlus drug-information page");

export const MedicationSchema = z.strictObject({
  id: slug,
  generic: GenericName,
  category: MedicationCategory,
  class: z.string().min(3).max(100),
  /** Current US brands RxNorm lists for this ingredient (single-ingredient products). */
  commonBrands: z.array(BrandName).max(8),
  /** Brands of combination products that contain this ingredient (RxNorm). */
  combinationBrands: z.array(BrandName).max(6).optional(),
  /** Familiar brand names that are NOT current RxNorm products (often discontinued) as of lastVerified. */
  formerBrands: z.array(BrandName).max(4).optional(),
  usedFor: z.array(UsedForSchema).min(1).max(8),
  /** Original, short clinician notes: notable cautions only. No doses, schedules or titration steps. */
  clinicianNotes: z.array(z.string().min(20).max(320)).min(1).max(5),
  /** Current FDA label carries a boxed warning (checked live on lastVerified). */
  boxedWarning: z.boolean(),
  deaSchedule: z.enum(DEA_SCHEDULES).optional(),
  /** Has substance-use-disorder treatment uses: show the 42 CFR Part 2 reminder (G6). */
  sudRelated: z.boolean().optional(),
  rxcui: Rxcui,
  /** RxNorm query name when it differs from `generic` (multiple-ingredient products). */
  rxnormName: RxNormName.optional(),
  label: LabelQuerySchema.optional(),
  /** Plain-language MedlinePlus drug pages (link out only), matched by RxCUI through MedlinePlus Connect. */
  medlinePlus: z.array(z.strictObject({ title: z.string().min(2).max(80), url: medlinePlusDrugUrl })).max(2),
});
export type Medication = z.infer<typeof MedicationSchema>;

export const MedicationsFileSchema = z
  .strictObject({
    version: z.string(),
    description: z.string().min(20),
    scope: z.string().includes("not prescribing"),
    /** Veterinary products that RxNorm lists under human ingredients; never shown as brands. */
    brandExclusions: z.array(BrandName),
    medications: z.array(MedicationSchema).min(50),
    ...governance,
  })
  .superRefine((file, ctx) => {
    const seen = new Set<string>();
    for (const m of file.medications) {
      for (const k of [`id:${m.id}`, `generic:${m.generic}`, `rxcui:${m.rxcui}`]) {
        if (seen.has(k)) ctx.addIssue({ code: "custom", message: `duplicate medication ${k}` });
        seen.add(k);
      }
      if (m.boxedWarning && !m.clinicianNotes.some((n) => /boxed warning/i.test(n)))
        ctx.addIssue({ code: "custom", message: `${m.id}: boxedWarning=true but no note mentions the boxed warning` });
    }
  });
export type MedicationsFile = z.infer<typeof MedicationsFileSchema>;

/* ---------------- loader ---------------- */
export const medicationsFile: MedicationsFile = MedicationsFileSchema.parse(medicationsJson);
export const MEDICATIONS: readonly Medication[] = medicationsFile.medications;

const byKey = new Map<string, Medication>();
for (const m of MEDICATIONS) for (const k of [m.id, m.generic]) byKey.set(k.toLowerCase(), m);

/** Every value a caller may send as `drug`: curated generic names plus medication ids. */
export const MEDICATION_KEYS: readonly string[] = [...new Set(MEDICATIONS.flatMap((m) => [m.generic, m.id]))];
export const MEDICATION_GENERICS: readonly string[] = MEDICATIONS.map((m) => m.generic);

/**
 * Outbound validator for a medication: curated generic name or id, case-insensitive; resolves to the medication id.
 * Printable ASCII is required BEFORE the case-insensitive match, so a Unicode look-alike (e.g. the Kelvin sign)
 * can never be case-mapped into a curated name.
 */
export const MedicationDrug = z
  .string()
  .max(120)
  .regex(/^[\x20-\x7E]*$/, "ASCII only")
  .pipe(curated(MEDICATION_KEYS))
  .transform((k) => byKey.get(k.toLowerCase())!.id);

/** Medications whose use is substance-use treatment (42 CFR Part 2 owner switch in src/server/core.ts). */
export function isSudTreatment(med: Pick<Medication, "category">): boolean {
  return med.category === "aud";
}

export function getMedication(key: string): Medication | undefined {
  return byKey.get(key.trim().toLowerCase());
}

export function medicationsByCategory(category: MedicationCategory): Medication[] {
  return MEDICATIONS.filter((m) => m.category === category);
}

/* ---------------- link-out builders (no data sent; the browser just opens the page) ---------------- */
export const NIMH_MEDICATIONS_URL = "https://www.nimh.nih.gov/health/topics/mental-health-medications";
const SET_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * DailyMed search for a curated generic name (fallback when the label API is unavailable). Only a curated generic
 * name (or medication id, resolved to its generic) is accepted, so typed text can never end up in the URL.
 */
export function dailyMedSearchUrl(generic: string): string {
  const med = typeof generic === "string" && /^[\x20-\x7E]{1,120}$/.test(generic) ? byKey.get(generic.trim().toLowerCase()) : undefined;
  if (!med) throw new z.ZodError([{ code: "custom", message: "not a curated medication", path: ["generic"], input: undefined }]);
  return `https://dailymed.nlm.nih.gov/dailymed/search.cfm?${new URLSearchParams({ labeltype: "all", query: med.generic })}`;
}

/** DailyMed page for one label (SPL set id). Returns null for anything that is not a set id. */
export function dailyMedLabelUrl(setId: string): string | null {
  return SET_ID.test(setId) ? `https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?${new URLSearchParams({ setid: setId.toLowerCase() })}` : null;
}

/** RxNav browser page for an RxCUI. */
export function rxNavConceptUrl(rxcui: string): string | null {
  return /^\d{1,10}$/.test(rxcui) ? `https://mor.nlm.nih.gov/RxNav/search?${new URLSearchParams({ searchBy: "RXCUI", searchTerm: rxcui })}` : null;
}
