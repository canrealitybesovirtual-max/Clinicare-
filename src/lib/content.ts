/**
 * Single entry point for all curated content. Everything is validated with zod at load time,
 * so malformed content fails the build and the tests (G10).
 * G7: only measures whose license is "confirmed" in content/licenses.json are exposed as built-in.
 */
import symptomsJson from "@content/symptoms.json";
import { conditionsRaw } from "./generated/content-index";
import gad7Json from "@content/measures/gad-7.json";
import phq9Json from "@content/measures/phq-9.json";
import pmrJson from "@content/handouts/pmr-homework.json";
import statsJson from "@content/stats/stats.json";
import crisisJson from "@content/crisis-lines.json";
import licensesJson from "@content/licenses.json";
import {
  ConditionSchema,
  CrisisLinesSchema,
  HandoutSchema,
  LicensesSchema,
  MeasureSchema,
  StatsFileSchema,
  SymptomLexiconSchema,
  type Condition,
  type Handout,
  type Measure,
  type Stat,
  type Symptom,
} from "./schemas";

export const lexicon = SymptomLexiconSchema.parse(symptomsJson);

/**
 * Every content/conditions/*.json file, in file-name order, from the generated static index (npm run gen:content).
 * A malformed file throws here with its id, so the build and the tests fail (G10).
 */
export const conditions: Condition[] = conditionsRaw.map((raw, i) => {
  const parsed = ConditionSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  const id = (raw as { id?: unknown } | null)?.id;
  throw new Error(`Invalid condition content (${typeof id === "string" ? id : `#${i}`}): ${parsed.error.message.slice(0, 400)}`);
});
export const licenses = LicensesSchema.parse(licensesJson);
const allMeasures: Measure[] = [gad7Json, phq9Json].map((m) => MeasureSchema.parse(m));
export const handouts: Handout[] = [pmrJson].map((h) => HandoutSchema.parse(h));
export const stats: Stat[] = StatsFileSchema.parse(statsJson).stats;
export const crisisLines = CrisisLinesSchema.parse(crisisJson);

export function isMeasureLicensed(m: Pick<Measure, "licenseKey">): boolean {
  return licenses.items[m.licenseKey]?.status === "confirmed";
}

/** Built-in measures: license confirmed only (G7). */
export const measures: Measure[] = allMeasures.filter(isMeasureLicensed);

const byId = <T extends { id: string }>(list: T[]) => new Map(list.map((x) => [x.id, x] as const));
const symptomMap = byId(lexicon.symptoms);
const conditionMap = byId(conditions);
const measureMap = byId(measures);
const handoutMap = byId(handouts);
const statMap = byId(stats);

export const getSymptom = (id: string): Symptom | undefined => symptomMap.get(id);
const getSymptomCategory = (id: string) => symptomMap.get(id)?.category;
export const getCondition = (id: string): Condition | undefined => conditionMap.get(id);
export const getMeasure = (id: string): Measure | undefined => measureMap.get(id);
export const getHandout = (id: string): Handout | undefined => handoutMap.get(id);
export const getStat = (id: string): Stat | undefined => statMap.get(id);

/** G13: flag statistics whose data are older than 5 years. */
export function isStatStale(stat: Pick<Stat, "dataYear">, now: Date = new Date()): boolean {
  const years = stat.dataYear.match(/\d{4}/g)?.map(Number) ?? [];
  if (years.length === 0) return true;
  return now.getFullYear() - Math.max(...years) > 5;
}

/** Cross-reference checks used by scripts/validate-content.ts and the unit tests. Returns error strings. */
export function contentProblems(): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const s of lexicon.symptoms) {
    if (ids.has(s.id)) problems.push(`symptoms.json: duplicate id ${s.id}`);
    ids.add(s.id);
  }
  for (const c of conditions) {
    const where = `conditions/${c.id}`;
    const core = c.features.filter((f) => f.kind === "core");
    if (core.length < c.minCore) problems.push(`${where}: minCore ${c.minCore} > core features ${core.length}`);
    for (const f of c.features) if (!symptomMap.has(f.symptomId)) problems.push(`${where}: unknown symptom ${f.symptomId}`);
    const seen = new Set<string>();
    for (const f of c.features) {
      if (seen.has(f.symptomId)) problems.push(`${where}: duplicate feature ${f.symptomId}`);
      seen.add(f.symptomId);
    }
    for (const m of c.measures) {
      const raw = allMeasures.find((x) => x.id === m);
      if (!raw) problems.push(`${where}: unknown measure ${m}`);
      else if (!isMeasureLicensed(raw)) problems.push(`${where}: measure ${m} license not confirmed (G7)`);
    }
    const featureIds = new Set(c.features.map((f) => f.symptomId));
    for (const r of c.requiredFeatures)
      if (!featureIds.has(r.symptomId)) problems.push(`${where}: required feature ${r.symptomId} is not one of its features`);
    const groupKind = new Map<string, string>();
    for (const f of c.features) {
      if (!f.group) continue;
      const kind = groupKind.get(f.group);
      if (kind && kind !== f.kind) problems.push(`${where}: group ${f.group} mixes core and associated features`);
      groupKind.set(f.group, f.kind);
    }
    const areas = new Set(c.features.filter((f) => f.breadthArea).map((f) => f.group ?? f.symptomId)).size;
    if (c.strongMinAreas !== undefined && c.strongMinAreas > areas)
      problems.push(`${where}: strongMinAreas ${c.strongMinAreas} > breadth areas ${areas}`);
    for (const f of c.features)
      if (getSymptomCategory(f.symptomId) === "cultural") problems.push(`${where}: cultural concept ${f.symptomId} must not be scored`);
    for (const m of c.measuresPending) {
      const lic = licenses.items[m.licenseKey];
      if (!lic) problems.push(`${where}: pending measure ${m.name} has no licenses.json entry ${m.licenseKey} (G7)`);
      else if (lic.status === "confirmed") problems.push(`${where}: ${m.name} is confirmed in licenses.json; build it in or drop it from measuresPending`);
    }
    for (const h of c.handouts) if (!handoutMap.has(h)) problems.push(`${where}: unknown handout ${h}`);
    for (const s of c.statIds) if (!statMap.has(s)) problems.push(`${where}: unknown stat ${s}`);
    for (const co of c.comorbidities)
      if (co.conditionId && !conditionMap.has(co.conditionId)) problems.push(`${where}: unknown comorbidity ${co.conditionId}`);
  }
  for (const m of allMeasures) {
    if (!isMeasureLicensed(m)) problems.push(`measures/${m.id}: license ${m.licenseKey} not confirmed (G7)`);
    for (const r of m.riskItems) if (!m.items.some((i) => i.id === r.itemId)) problems.push(`measures/${m.id}: risk item ${r.itemId} missing`);
    const bands = [...m.scoring.bands].sort((a, b) => a.min - b.min);
    let expect = m.scoring.min;
    for (const b of bands) {
      if (b.min !== expect) problems.push(`measures/${m.id}: band gap/overlap at ${b.min}`);
      expect = b.max + 1;
    }
    if (expect !== m.scoring.max + 1) problems.push(`measures/${m.id}: bands do not end at max ${m.scoring.max}`);
  }
  const today = new Date().toISOString().slice(0, 10);
  const all = [lexicon, ...conditions, ...allMeasures, ...handouts, ...stats] as { lastVerified: string; reviewedBy: string }[];
  for (const item of all) if (item.lastVerified > today) problems.push(`lastVerified in the future: ${item.lastVerified}`);
  return problems;
}
