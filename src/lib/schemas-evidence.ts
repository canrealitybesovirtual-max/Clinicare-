/**
 * Content contracts (zod) for the evidence and statistics integrations (Phase 3):
 * - content/evidence-queries.json: curated PubMed search strategies + ClinicalTrials.gov condition terms.
 * - content/gho-indicators.json: curated WHO Global Health Observatory indicators + WHO area codes.
 * These files are the ONLY source of values the server may send to NCBI, ClinicalTrials.gov or WHO (G5, G17).
 * Each file carries the governance block (G10). Isomorphic: no server-only imports.
 */
import { z } from "zod";
import { governance, slug } from "./schemas";

/* ------------------------------------------------------------------ */
/* PubMed search strategies                                            */
/* ------------------------------------------------------------------ */

/** PubMed field tags a curated query may use. Anything else is rejected at content-validation time. */
export const PUBMED_FIELD_TAGS = ["mh", "mh:noexp", "majr", "tiab", "ti", "pt", "dp", "la", "sh"] as const;
const TAG_SET = new Set<string>(PUBMED_FIELD_TAGS);

/** Problems with a PubMed query string (empty array = well-formed). Exported for tests and the content CLI. */
export function pubmedQueryProblems(q: string): string[] {
  const problems: string[] = [];
  if (!/^[A-Za-z0-9 "()[\]*\-/,:.]+$/.test(q)) problems.push("unexpected character");
  if (/\s{2,}/.test(q) || q !== q.trim()) problems.push("stray whitespace");
  if ((q.match(/"/g) ?? []).length % 2 !== 0) problems.push("unbalanced quotes");
  let depth = 0;
  for (const ch of q.replace(/"[^"]*"/g, "")) {
    if (ch === "(") depth++;
    if (ch === ")" && --depth < 0) break;
  }
  if (depth !== 0) problems.push("unbalanced parentheses");
  if (!/^[^[\]]*(?:\[[^[\]]+\][^[\]]*)*$/.test(q.replace(/"[^"]*"/g, '""'))) problems.push("unbalanced field-tag brackets");
  if (/\(\s*\)/.test(q)) problems.push("empty group");
  for (const m of q.matchAll(/\[([^\]]*)\]/g)) if (!TAG_SET.has(m[1]!.toLowerCase())) problems.push(`field tag [${m[1]}]`);
  if (/\b(?:and|or|not)\s*\(/.test(q.replace(/"[^"]*"/g, ""))) problems.push("lower-case boolean operator");
  if (/^(?:AND|OR|NOT)\b|\b(?:AND|OR|NOT)$/.test(q)) problems.push("dangling boolean operator");
  return problems;
}

const pubmedQuery = z
  .string()
  .min(5)
  .max(600)
  .superRefine((q, ctx) => {
    for (const p of pubmedQueryProblems(q)) ctx.addIssue({ code: "custom", message: `PubMed query: ${p}` });
  });

export const EvidenceQueryKind = z.enum(["condition", "intervention"]);
export type EvidenceQueryKind = z.infer<typeof EvidenceQueryKind>;

export const EvidenceQuerySchema = z.strictObject({
  kind: EvidenceQueryKind,
  label: z.string().min(3).max(100),
  /** Topic part of the strategy (MeSH + title/abstract terms); the file-level filter is appended at request time. */
  query: pubmedQuery,
  /** Intervention ids in content/interventions that this evidence set supports (UI "evidence" links). */
  interventionIds: z.array(slug).max(12).default([]),
  /** Substance-use topic: the UI shows the Part 2 banner beside the evidence (G6). */
  sud: z.boolean().default(false),
});
export type EvidenceQuery = z.infer<typeof EvidenceQuerySchema>;

/* ------------------------------------------------------------------ */
/* ClinicalTrials.gov condition terms and locations                    */
/* ------------------------------------------------------------------ */

/** Plain condition term: letters, spaces and hyphens only (it is sent as query.cond). */
const conditionTerm = z
  .string()
  .min(3)
  .max(60)
  .regex(/^[A-Za-z][A-Za-z -]*[A-Za-z]$/, "plain condition term");

/** A ClinicalTrials.gov LocationCountry value (letters plus the punctuation real country names use). */
export const trialCountryName = z
  .string()
  .min(2)
  .max(60)
  .regex(/^[\p{L}][\p{L} .,'’()&-]*[\p{L})]$/u, "country name");

export const TrialConditionSchema = z.strictObject({
  label: z.string().min(3).max(80),
  term: conditionTerm,
  sud: z.boolean().default(false),
});
export type TrialCondition = z.infer<typeof TrialConditionSchema>;

export const EvidenceQueriesFileSchema = z
  .object({
    version: z.string(),
    description: z.string().optional(),
    pubmed: z.strictObject({ filter: pubmedQuery, filterLabel: z.string().min(10).max(300) }),
    queries: z.record(slug, EvidenceQuerySchema),
    trials: z.strictObject({
      adultOnly: z.boolean(),
      conditions: z.record(slug, TrialConditionSchema),
      countries: z.array(trialCountryName).min(20),
    }),
    ...governance,
  })
  .superRefine((file, ctx) => {
    const ids = Object.keys(file.queries);
    if (ids.length < 20) ctx.addIssue({ code: "custom", message: "expected at least 20 curated queries" });
    for (const id of Object.keys(file.trials.conditions)) {
      if (file.queries[id]?.kind !== "condition") ctx.addIssue({ code: "custom", message: `trial condition ${id} has no condition query` });
    }
    const terms = new Set<string>();
    for (const c of Object.values(file.trials.conditions)) {
      const k = c.term.toLowerCase();
      if (terms.has(k)) ctx.addIssue({ code: "custom", message: `duplicate trial term ${c.term}` });
      terms.add(k);
    }
    const countries = new Set<string>();
    for (const c of file.trials.countries) {
      if (countries.has(c.toLowerCase())) ctx.addIssue({ code: "custom", message: `duplicate country ${c}` });
      countries.add(c.toLowerCase());
    }
    if (!countries.has("united states")) ctx.addIssue({ code: "custom", message: "countries must include United States" });
  });
export type EvidenceQueriesFile = z.infer<typeof EvidenceQueriesFileSchema>;

/* ------------------------------------------------------------------ */
/* WHO Global Health Observatory                                       */
/* ------------------------------------------------------------------ */

export const WHO_REGIONS = ["AFR", "AMR", "EMR", "EUR", "SEAR", "WPR"] as const;
export const GhoAreaType = z.enum(["COUNTRY", "REGION", "GLOBAL"]);
export type GhoAreaType = z.infer<typeof GhoAreaType>;

const whoPage = z.url().refine((u) => {
  try {
    const p = new URL(u);
    return p.protocol === "https:" && (p.hostname === "www.who.int" || p.hostname === "who.int");
  } catch {
    return false;
  }
}, "https://www.who.int page");

/** GHO indicator code, e.g. MH_12, SDGSUICIDE, SA_0000001688. Upper-case letters, digits and underscores only. */
export const ghoIndicatorCode = z.string().regex(/^[A-Z][A-Z0-9_]{1,39}$/, "GHO indicator code");
const ghoDimType = z.string().regex(/^[A-Z]{2,30}$/, "GHO dimension type");
const ghoDimCode = z.string().regex(/^[A-Z][A-Z0-9_+-]{1,59}$/, "GHO dimension code");

export const GhoIndicatorSchema = z.strictObject({
  code: ghoIndicatorCode,
  label: z.string().min(3).max(100),
  whoName: z.string().min(3).max(200), // WHO's own indicator name, verbatim, for transparency
  unit: z.string().min(2).max(80),
  valueType: z.enum(["numeric", "text"]),
  decimals: z.number().int().min(0).max(3).default(1),
  topic: z.enum(["suicide", "workforce", "services", "policy", "alcohol"]),
  /** Dimension values that make up the headline figure (e.g. both sexes, all ages). */
  headline: z.record(ghoDimType, ghoDimCode).default({}),
  page: whoPage,
  note: z.string().max(300).optional(),
});
export type GhoIndicator = z.infer<typeof GhoIndicatorSchema>;

export const GhoAreaSchema = z
  .strictObject({
    code: z.string().regex(/^[A-Z]{3,6}$/, "ISO3 or WHO area code"),
    name: z.string().min(2).max(100),
    type: GhoAreaType,
    region: z.enum(WHO_REGIONS).optional(),
  })
  .superRefine((a, ctx) => {
    if (a.type === "COUNTRY" && !/^[A-Z]{3}$/.test(a.code)) ctx.addIssue({ code: "custom", message: `country ${a.code} must be ISO3` });
    if (a.type === "COUNTRY" && !a.region) ctx.addIssue({ code: "custom", message: `country ${a.code} needs a WHO region` });
    if (a.type === "REGION" && !(WHO_REGIONS as readonly string[]).includes(a.code)) ctx.addIssue({ code: "custom", message: `unknown region ${a.code}` });
    if (a.type === "GLOBAL" && a.code !== "GLOBAL") ctx.addIssue({ code: "custom", message: "global area code must be GLOBAL" });
  });
export type GhoArea = z.infer<typeof GhoAreaSchema>;

export const GhoIndicatorsFileSchema = z
  .object({
    version: z.string(),
    description: z.string().optional(),
    endpoint: z.url(),
    endpointStatus: z.string().min(10),
    indicators: z.record(slug, GhoIndicatorSchema),
    dimensionTypeLabels: z.record(ghoDimType, z.string().min(2).max(40)),
    dimensionLabels: z.record(ghoDimCode, z.string().min(2).max(60)),
    areas: z.array(GhoAreaSchema).min(200),
    ...governance,
  })
  .superRefine((file, ctx) => {
    const codes = new Set<string>();
    for (const [id, ind] of Object.entries(file.indicators)) {
      if (codes.has(ind.code)) ctx.addIssue({ code: "custom", message: `duplicate indicator code ${ind.code} (${id})` });
      codes.add(ind.code);
    }
    const areas = new Set<string>();
    for (const a of file.areas) {
      if (areas.has(a.code)) ctx.addIssue({ code: "custom", message: `duplicate area ${a.code}` });
      areas.add(a.code);
    }
    if (!areas.has("GLOBAL") || !areas.has("USA")) ctx.addIssue({ code: "custom", message: "areas must include GLOBAL and USA" });
  });
export type GhoIndicatorsFile = z.infer<typeof GhoIndicatorsFileSchema>;
