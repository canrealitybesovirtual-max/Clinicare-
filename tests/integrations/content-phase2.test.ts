/**
 * Phase 2/3 content validation (G10 and cross-references). Covers the content files that src/lib/content.ts and
 * scripts/validate-content.ts do not load yet: topics, medications, evidence queries, GHO indicators, referral
 * directories and data tables, the Ethics & Legal Hub, and content/{interventions,plans,handouts}/*.json.
 *
 * Every item must carry sources[], license and lastVerified (G10); reviewedBy may be "PENDING".
 * Cross-references: plan interventionIds exist, intervention handoutIds exist, evidence-query interventionIds
 * exist, plan measureIds are only built-in, license-confirmed measures (gad-7, phq-9; G7).
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { measures } from "@/lib/content";
import { EvidenceQueriesFileSchema, GhoIndicatorsFileSchema, pubmedQueryProblems } from "@/lib/schemas-evidence";
import { EthicsCodeSchema, HUB_PROMPTS, LegalTopicSchema, hubProblems, type EthicsCode, type LegalTopic } from "@/lib/schemas-hub";
import { MedicationsFileSchema } from "@/lib/schemas-medications";
import { InterventionSchema, PlanLibrarySchema, type Intervention, type PlanLibrary } from "@/lib/schemas-phase2";
import { ReferralDirectorySchema } from "@/lib/schemas-referrals";
import { HandoutSchema, SourceSchema, isoDate, type Handout } from "@/lib/schemas";
import { HealthTopicsFileSchema } from "@/server/integrations/medlineplus-topics";
import { placeCount } from "@/server/integrations/places";

const CONTENT = path.resolve(__dirname, "../../content");
const readJson = (rel: string): unknown => JSON.parse(fs.readFileSync(path.join(CONTENT, rel), "utf8"));
const listJson = (dir: string): string[] =>
  fs.existsSync(path.join(CONTENT, dir)) ? fs.readdirSync(path.join(CONTENT, dir)).filter((f) => f.endsWith(".json")).sort() : [];

/** Parse and return readable problems instead of a thrown ZodError (so one test lists every broken file). */
function check<T>(schema: z.ZodType<T>, rel: string, problems: string[]): T | null {
  let raw: unknown;
  try {
    raw = readJson(rel);
  } catch (e) {
    problems.push(`${rel}: not valid JSON (${(e as Error).message.slice(0, 80)})`);
    return null;
  }
  const r = schema.safeParse(raw);
  if (!r.success) {
    for (const issue of r.error.issues.slice(0, 8)) problems.push(`${rel}: ${issue.path.join(".") || "(root)"}: ${issue.message}`);
    return null;
  }
  return r.data;
}

const BUILT_IN_MEASURES = new Set(measures.map((m) => m.id));

/* ---------------- load everything once ---------------- */
const loadProblems: Record<string, string[]> = {
  interventions: [],
  plans: [],
  handouts: [],
  topics: [],
  medications: [],
  evidence: [],
  gho: [],
  referrals: [],
  ethics: [],
  legal: [],
};

const interventions = listJson("interventions")
  .map((f) => ({ file: f, item: check(InterventionSchema, `interventions/${f}`, loadProblems.interventions!) }))
  .filter((x): x is { file: string; item: Intervention } => x.item !== null);
const plans = listJson("plans")
  .map((f) => ({ file: f, item: check(PlanLibrarySchema, `plans/${f}`, loadProblems.plans!) }))
  .filter((x): x is { file: string; item: PlanLibrary } => x.item !== null);
const handouts = listJson("handouts")
  .map((f) => ({ file: f, item: check(HandoutSchema, `handouts/${f}`, loadProblems.handouts!) }))
  .filter((x): x is { file: string; item: Handout } => x.item !== null);
const topics = check(HealthTopicsFileSchema, "topics.json", loadProblems.topics!);
const medications = check(MedicationsFileSchema, "medications.json", loadProblems.medications!);
const evidence = check(EvidenceQueriesFileSchema, "evidence-queries.json", loadProblems.evidence!);
const gho = check(GhoIndicatorsFileSchema, "gho-indicators.json", loadProblems.gho!);
const referralFiles = ["referrals/us.json", "referrals/international.json"].map((rel) => ({
  rel,
  dir: check(ReferralDirectorySchema, rel, loadProblems.referrals!),
}));
const ethics = listJson("ethics")
  .map((f) => ({ file: f, item: check(EthicsCodeSchema, `ethics/${f}`, loadProblems.ethics!) }))
  .filter((x): x is { file: string; item: EthicsCode } => x.item !== null);
const legal = listJson("legal")
  .map((f) => ({ file: f, item: check(LegalTopicSchema, `legal/${f}`, loadProblems.legal!) }))
  .filter((x): x is { file: string; item: LegalTopic } => x.item !== null);

const interventionIds = new Set(interventions.map((i) => i.item.id));
const handoutIds = new Set(handouts.map((h) => h.item.id));

/* ---------------- schema validation, one test per content family ---------------- */
describe("Phase 2/3 content parses against its schema (G10: sources, license, lastVerified, reviewedBy)", () => {
  for (const [family, problems] of Object.entries(loadProblems)) {
    it(`${family}: every file is valid`, () => {
      expect(problems).toEqual([]);
    });
  }

  it("every family is present and non-trivial", () => {
    expect(interventions.length).toBeGreaterThanOrEqual(20);
    expect(plans.length).toBeGreaterThanOrEqual(5);
    expect(handouts.length).toBeGreaterThanOrEqual(5);
    expect(topics?.topics.length ?? 0).toBeGreaterThanOrEqual(20);
    expect(medications?.medications.length ?? 0).toBeGreaterThanOrEqual(50);
    expect(Object.keys(evidence?.queries ?? {}).length).toBeGreaterThanOrEqual(9);
    expect(Object.keys(gho?.indicators ?? {}).length).toBeGreaterThanOrEqual(5);
    expect(ethics.length).toBeGreaterThanOrEqual(10);
    expect(legal.length).toBeGreaterThanOrEqual(5);
  });

  it("ids match file names (interventions, plans by conditionId, handouts)", () => {
    const bad: string[] = [];
    for (const { file, item } of interventions) if (`${item.id}.json` !== file) bad.push(`interventions/${file}: id ${item.id}`);
    for (const { file, item } of plans) if (`${item.conditionId}.json` !== file) bad.push(`plans/${file}: conditionId ${item.conditionId}`);
    for (const { file, item } of handouts) if (`${item.id}.json` !== file) bad.push(`handouts/${file}: id ${item.id}`);
    expect(bad).toEqual([]);
  });

  it("no lastVerified date is in the future", () => {
    const today = new Date().toISOString().slice(0, 10);
    const future: string[] = [];
    const all: [string, { lastVerified: string }][] = [
      ...interventions.map((x) => [`interventions/${x.file}`, x.item] as [string, { lastVerified: string }]),
      ...plans.map((x) => [`plans/${x.file}`, x.item] as [string, { lastVerified: string }]),
      ...handouts.map((x) => [`handouts/${x.file}`, x.item] as [string, { lastVerified: string }]),
      ...(topics ? [["topics.json", topics] as [string, { lastVerified: string }]] : []),
      ...(medications ? [["medications.json", medications] as [string, { lastVerified: string }]] : []),
    ];
    for (const [where, item] of all) if (item.lastVerified > today) future.push(`${where}: ${item.lastVerified}`);
    expect(future).toEqual([]);
  });
});

/* ---------------- cross-references ---------------- */
describe("cross-references", () => {
  it("every plan objective's interventionIds exist in content/interventions", () => {
    const missing: string[] = [];
    for (const { file, item } of plans)
      for (const p of item.problems)
        for (const o of p.shortTermObjectives)
          for (const id of o.interventionIds) if (!interventionIds.has(id)) missing.push(`plans/${file} ${p.id}/${o.id}: ${id}`);
    expect(missing).toEqual([]);
  });

  it("plan measureIds are only built-in, license-confirmed measures (gad-7, phq-9; G7)", () => {
    expect([...BUILT_IN_MEASURES].sort()).toEqual(["gad-7", "phq-9"]);
    const bad: string[] = [];
    for (const { file, item } of plans)
      for (const p of item.problems) for (const m of p.measureIds) if (!BUILT_IN_MEASURES.has(m)) bad.push(`plans/${file} ${p.id}: ${m}`);
    expect(bad).toEqual([]);
  });

  it("every intervention's handoutIds exist in content/handouts", () => {
    const missing: string[] = [];
    for (const { file, item } of interventions) for (const h of item.handoutIds) if (!handoutIds.has(h)) missing.push(`interventions/${file}: ${h}`);
    expect(missing).toEqual([]);
  });

  it("plan, objective and problem ids are unique within each plan", () => {
    const dupes: string[] = [];
    for (const { file, item } of plans) {
      const seen = new Set<string>();
      for (const p of item.problems) {
        for (const id of [`problem:${p.id}`, ...p.shortTermObjectives.map((o) => `objective:${o.id}`)]) {
          if (seen.has(id)) dupes.push(`plans/${file}: ${id}`);
          seen.add(id);
        }
      }
    }
    expect(dupes).toEqual([]);
  });

  it("evidence-query interventionIds exist, and every strategy is a well-formed PubMed query", () => {
    const missing: string[] = [];
    for (const [id, q] of Object.entries(evidence?.queries ?? {})) {
      for (const iv of q.interventionIds) if (!interventionIds.has(iv)) missing.push(`evidence-queries ${id}: ${iv}`);
      for (const p of pubmedQueryProblems(q.query)) missing.push(`evidence-queries ${id}: ${p}`);
    }
    expect(missing).toEqual([]);
  });

  it("substance-use content is flagged for the 42 CFR Part 2 notice (G6)", () => {
    const alcoholPlan = plans.find((p) => p.item.conditionId === "alcohol-use-disorder");
    if (alcoholPlan) expect(alcoholPlan.item.sud).toBe(true);
    for (const id of ["drinking-diary", "urge-surfing-log"]) {
      const h = handouts.find((x) => x.item.id === id);
      if (h && /alcohol|drink|substance/i.test(JSON.stringify(h.item.sections))) expect(h.item.sud, `handouts/${id}.json`).toBe(true);
    }
    expect(topics?.topics.find((t) => t.id === "alcohol")?.sud).toBe(true);
    expect(evidence?.queries["alcohol-use-disorder"]?.sud).toBe(true);
  });

  it("Ethics & Legal Hub: hubProblems() is clean (ids, prompts, required Part 2 notice)", () => {
    expect(hubProblems(ethics, legal)).toEqual([]);
    const ids = new Set(ethics.map((e) => e.item.id));
    for (const p of Object.values(HUB_PROMPTS)) for (const id of p.ethicsIds) expect(ids.has(id), id).toBe(true);
  });
});

/* ---------------- referral data tables (not item content, but still governed) ---------------- */
describe("referral data tables carry provenance and licence", () => {
  const Table = z.object({
    _about: z.string().min(40),
    format: z.string().min(10),
    sources: z.array(SourceSchema).min(1),
    license: z.string().min(20),
  });

  it("zcta-centroids.json and us-places.json declare sources, licence and a verification/extraction date", () => {
    for (const rel of ["referrals/zcta-centroids.json", "referrals/us-places.json"]) {
      const raw = readJson(rel) as Record<string, unknown>;
      expect(Table.safeParse(raw).success, rel).toBe(true);
      const date = (raw.lastVerified ?? raw.extractedOn) as string;
      expect(isoDate.safeParse(date).success, `${rel} date`).toBe(true);
    }
    const places = readJson("referrals/us-places.json") as { license: string; attribution: string; count: number };
    expect(places.license).toMatch(/GeoNames/);
    expect(places.license).toMatch(/CC BY 4\.0/);
    expect(places.attribution).toMatch(/GeoNames/);
    expect(placeCount()).toBe(places.count);
  });

  it("directories validate and every entry is link-out only (no worksheets re-hosted, G8)", () => {
    for (const { rel, dir } of referralFiles) {
      expect(dir, rel).not.toBeNull();
      for (const e of (dir as { entries?: { url?: string }[] } | null)?.entries ?? []) {
        if (e.url) expect(e.url, rel).toMatch(/^https:\/\//);
      }
    }
  });
});
