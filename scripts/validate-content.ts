/**
 * CI gate (G1, G3, G6, G7, G10, G13). Exit 1 on any problem.
 *  1. The core content parses and cross-references cleanly (src/lib/content.ts contentProblems()): lexicon,
 *     every condition, built-in measures and stats.
 *  2. The whole library parses and cross-references cleanly (src/lib/library.ts libraryProblems() plus the
 *     cross-content checks below): handouts, interventions, plans, ethics codes and legal topics, and the links
 *     between them and the conditions.
 *  3. EVERY file under content/ matches a registered schema with governance (scripts/content-audit.ts).
 *  4. Handout wiring (wiringReport): every handout has its Spanish version and is linked from at least one
 *     condition, intervention, client topic or library item. Inverse links (an intervention's handout missing from
 *     all of its conditions, a handout only library items reach) and the review queue are reported, never failed.
 * `--release` also fails while any crisis line is unverified (a person must check each official site).
 * `--report` prints every report-only line instead of the counts.
 */
import path from "node:path";
import { CASE_RESTRICTED_ABBREVIATIONS, matchSymptoms } from "../src/lib/matcher";
import { conditions, contentProblems, lexicon, measures, stats } from "../src/lib/content";
import {
  ethicsCodes,
  handouts,
  interventions,
  interventionsFor,
  legalTopics,
  libraryProblems,
  planLibraries,
} from "../src/lib/library";
import topicsJson from "../content/topics.json";
import triggerObjectsJson from "../content/trigger-objects.json";
import { followUpFiles } from "../src/lib/follow-up/bank";
import { HealthTopicsFileSchema } from "../src/lib/schemas-topics";
import { auditContent } from "./content-audit";
import { existsSync, readdirSync } from "node:fs";
import { licenses } from "../src/lib/content";
import { formulationProblems, formulations } from "../src/lib/formulations";
import { orientationProblems, orientations } from "../src/lib/orientations";
import { planContentProblems, planModules } from "../src/lib/plan-modules";
import { FORMULATION_TARGET_IDS } from "../src/lib/formulations";
import { practiceGuides, practiceProblems } from "../src/lib/practice";
import { medicationEffectProblems, medicationEffectsFile } from "../src/lib/schemas-care";
import { populationProblems, populations } from "../src/lib/populations";
import { legalTopicLinkProblems } from "../src/lib/schemas-hub";
import { z } from "zod";
import { slug, type Condition, type Handout } from "../src/lib/schemas";
import type { Intervention } from "../src/lib/schemas-phase2";
import { interventionsRaw } from "../src/lib/generated/interventions";

/** Exact 42 CFR Part 2 notice (owner decision 2026-11-26, docs/RESOURCES.md). */
export const PART2_NOTICE = "42 CFR Part 2 prohibits unauthorized use or disclosure of these records.";

/** Each condition should have at least this many library interventions linked to it. */
export const MIN_INTERVENTIONS_PER_CONDITION = 5;

const ICD10CM_CODE = /^[A-Z]\d{2}(\.\w{1,4})?$/;
const ICD11_CODE = /^[0-9A-Z]{4}(\.[0-9A-Z]{1,3})?$/;

/** Wording that must never appear in clinical content (G1 criteria structure, G3 final diagnosis, G4, G15). */
const BANNED_CONTENT: readonly [RegExp, string][] = [
  [/\bcriterion\b/i, "G1: 'criterion' (DSM criteria structure)"],
  [/DSM-5(-TR)?\s+(diagnostic\s+)?criteria/i, "G1: 'DSM-5 criteria'"],
  [/\bcriteria\s+[A-H]\b/, "G1: 'criteria A-H'"],
  [/\bmeets (the )?(full )?criteria\b/i, "G3: 'meets criteria'"],
  [/\b(confirms|confirmed) (the |a )?diagnosis\b/i, "G3: 'confirmed diagnosis'"],
  [/\bthe diagnosis is\b/i, "G3: 'the diagnosis is'"],
  [/homeopath/i, "G4: homeopathy"],
  [/HIPAA[ -](certified|approved|certification)/i, "G15: HIPAA certification claim"],
];

/**
 * Close paraphrases of DSM-5-TR criterion wording (G1). Each entry fails when ALL of its patterns occur in one
 * string of a content item (one note, question or summary), so a single everyday phrase such as "out of
 * proportion" stays allowed while the criteria sequence it belongs to does not.
 */
const CLOSE_PARAPHRASE: readonly [readonly RegExp[], string][] = [
  [[/endured with intense/i], "G1: 'endured with intense ...' (phobia criteria wording)"],
  [[/\b(nearly|almost) (every time|always)\b/i, /out of proportion/i], "G1: 'nearly every time ... out of proportion' (phobia criteria sequence)"],
  [[/preoccupation with (having|getting|acquiring)/i], "G1: 'preoccupation with having or getting an illness' (illness-anxiety criteria wording)"],
  [[/\bexpansive,? (or|and) irritable\b/i], "G1: 'elevated, expansive or irritable mood' (manic-episode criteria wording)"],
  [[/abnormally and persistently/i], "G1: 'abnormally and persistently' (manic-episode criteria wording)"],
];

/** Every string inside a content item, so CLOSE_PARAPHRASE checks one field at a time. */
function stringsOf(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(stringsOf);
  if (value && typeof value === "object") return Object.values(value).flatMap(stringsOf);
  return [];
}

/**
 * A curated place that offers client handouts. Condition and intervention links make a handout a suggestion on
 * that card; client-topic links reach clients; library links (formulation frameworks, practice guides, population
 * profiles, orientation profiles, plan problems) reach clinicians who open that item.
 */
export interface HandoutLink {
  where: string;
  kind: "condition" | "intervention" | "topic" | "library";
  handoutIds: readonly string[];
}

export interface WiringInput {
  handouts: readonly Pick<Handout, "id" | "es">[];
  conditions: readonly Pick<Condition, "id" | "handouts">[];
  interventions: readonly Pick<Intervention, "id" | "conditions" | "handoutIds">[];
  /** Client topics and library items (conditions and interventions are read from their own lists). */
  links: readonly HandoutLink[];
}

/**
 * Handout wiring. Pure. Problems: a handout without its Spanish version, or one that no condition, intervention,
 * client topic or library item links (no page would offer it). Warnings (report only): a handout reached only from
 * library items, so no condition card or client topic suggests it, and an intervention handout that none of the
 * intervention's conditions lists. Unknown ids are reported by each type's own checks, not repeated here.
 */
export function wiringReport({ handouts, conditions, interventions, links }: WiringInput): { problems: string[]; warnings: string[] } {
  const problems: string[] = [];
  const warnings: string[] = [];
  const linkedFrom = new Map<string, HandoutLink[]>();
  const all: HandoutLink[] = [
    ...conditions.map((c): HandoutLink => ({ where: `conditions/${c.id}`, kind: "condition", handoutIds: c.handouts })),
    ...interventions.map((i): HandoutLink => ({ where: `interventions/${i.id}`, kind: "intervention", handoutIds: i.handoutIds })),
    ...links,
  ];
  for (const l of all) for (const id of l.handoutIds) linkedFrom.set(id, [...(linkedFrom.get(id) ?? []), l]);

  for (const h of handouts) {
    const where = `handouts/${h.id}`;
    if (!h.es) problems.push(`${where}: no Spanish version (es); every client handout needs one`);
    const from = linkedFrom.get(h.id) ?? [];
    if (!from.length) problems.push(`${where}: not linked from any condition, intervention, client topic or library item, so no page offers it`);
    else if (from.every((l) => l.kind === "library"))
      warnings.push(`${where}: reached only from ${from.map((l) => l.where).join(", ")}; no condition, intervention or client topic suggests it`);
  }

  const onCondition = new Map(conditions.map((c) => [c.id, new Set(c.handouts)] as const));
  for (const i of interventions) {
    const missing = i.handoutIds.filter((h) => !i.conditions.some((c) => onCondition.get(c)?.has(h)));
    if (missing.length) warnings.push(`interventions/${i.id}: ${missing.join(", ")} not listed on any of its conditions (${i.conditions.join(", ")})`);
  }
  return { problems, warnings };
}

/** Every client topic and library item that links handouts, from the loaded content. */
export function handoutLinks(): HandoutLink[] {
  const library = (where: string, handoutIds: readonly string[] | undefined): HandoutLink => ({ where, kind: "library", handoutIds: handoutIds ?? [] });
  return [
    ...HealthTopicsFileSchema.parse(topicsJson).topics.map((t): HandoutLink => ({ where: `topics.json/${t.id}`, kind: "topic", handoutIds: t.handoutIds })),
    ...formulations.map((f) => library(`formulations/${f.id}`, f.handoutIds)),
    ...practiceGuides.map((g) => library(`practice/${g.id}`, g.relatedHandoutIds)),
    ...populations.map((pop) => library(`populations/${pop.id}`, pop.handoutIds)),
    ...orientations.map((o) => library(`orientations/${o.id}`, o.handoutIds)),
    ...planLibraries.flatMap((pl) => pl.problems.map((prob) => library(`plans/${pl.conditionId} ${prob.id}`, prob.handoutIds))),
    ...planModules.flatMap((m) => m.problems.map((prob) => library(`plans/modules/${m.id} ${prob.id}`, prob.handoutIds))),
  ];
}

/** wiringReport over the loaded content. */
export const contentWiring = () => wiringReport({ handouts, conditions, interventions, links: handoutLinks() });

/**
 * Optional structured evidence grades on interventions: what a named body recommends, for whom, in its own
 * strength term, with a link to the guideline. Checked on the raw files because InterventionSchema does not carry
 * the field yet; grades older than five years are listed by the content audit's review queue.
 */
export const EvidenceGradeSchema = z.strictObject({
  body: z.enum(["NICE", "VA/DoD", "APA", "APA Div 12", "WHO", "Cochrane", "USPSTF", "AASM", "SAMHSA", "other"]),
  guideline: z.string().min(5),
  year: z.number().int().min(1990),
  conditionId: slug.optional(),
  population: z.string().min(5).optional(),
  direction: z.enum(["for", "against", "insufficient"]),
  strength: z.string().min(2),
  url: z.url().refine((u) => u.startsWith("https://"), "https URLs only"),
});

/** Each raw intervention's evidenceGrades parse, are not dated in the future and name one of its own conditions. */
export function evidenceGradeProblems(raw: readonly unknown[], thisYear = new Date().getFullYear()): string[] {
  const p: string[] = [];
  for (const item of raw) {
    const { id, conditions: listed = [], evidenceGrades } = item as { id?: string; conditions?: string[]; evidenceGrades?: unknown };
    if (evidenceGrades === undefined) continue;
    const where = `interventions/${String(id)} evidenceGrades`;
    const parsed = z.array(EvidenceGradeSchema).max(6).safeParse(evidenceGrades);
    if (!parsed.success) {
      p.push(`${where}: ${parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
      continue;
    }
    for (const g of parsed.data) {
      if (g.year > thisYear) p.push(`${where}: ${g.body} ${g.year} is in the future`);
      if (g.conditionId && !listed.includes(g.conditionId)) p.push(`${where}: ${g.body} grade names ${g.conditionId}, which this intervention does not list`);
    }
  }
  return p;
}

/** Text that surfaces as a suggestion flag or note must not read as a verdict (G3). */
const VERDICT_WORDS = /\b(diagnosed|diagnosis is|meets|confirmed|definitely|certainly)\b/i;

/**
 * Checks that span the core loader (content.ts) and the full library (library.ts). Pure; returns error strings.
 * Covers every condition, intervention, plan and handout, so CI covers all content (G10).
 */
export function crossContentProblems(): string[] {
  const p: string[] = [...libraryProblems()];
  const conditionIds = new Set(conditions.map((c) => c.id));

  const dupes = <T>(list: T[], key: (t: T) => string, where: string) => {
    const seen = new Set<string>();
    for (const x of list) {
      const k = key(x);
      if (seen.has(k)) p.push(`${where}: duplicate id ${k}`);
      seen.add(k);
    }
  };
  dupes(conditions, (c) => c.id, "conditions");
  dupes(interventions, (i) => i.id, "interventions");
  dupes(planLibraries, (pl) => pl.conditionId, "plans");
  dupes(handouts, (h) => h.id, "handouts");
  dupes(ethicsCodes, (e) => e.id, "ethics");
  dupes(legalTopics, (t) => t.id, "legal");

  // Interventions point only at real conditions.
  for (const i of interventions)
    for (const c of i.conditions) if (!conditionIds.has(c)) p.push(`interventions/${i.id}: unknown condition ${c}`);

  // Symptom ids that gate suggestions (suggestWith, requiresAny) or map codes to a phobia type (featureIds) exist,
  // and a code's featureIds are features of its own condition.
  const symptomIds = new Set(lexicon.symptoms.map((s) => s.id));
  const unknownSymptoms = (where: string, ids: readonly string[] | undefined) => {
    for (const id of ids ?? []) if (!symptomIds.has(id)) p.push(`${where}: unknown symptom ${id}`);
  };
  for (const i of interventions) unknownSymptoms(`interventions/${i.id} suggestWith`, i.suggestWith);
  for (const h of handouts) unknownSymptoms(`handouts/${h.id} suggestWith`, h.suggestWith);
  for (const c of conditions) {
    for (const iv of c.interventions) unknownSymptoms(`conditions/${c.id} interventions "${iv.name}" requiresAny`, iv.requiresAny);
    const features = new Set(c.features.map((f) => f.symptomId));
    for (const code of c.icd10cm)
      for (const id of code.featureIds ?? []) if (!features.has(id)) p.push(`conditions/${c.id} ${code.code}: featureIds ${id} is not a feature of this condition`);
  }

  // Plans: one per condition, linked interventions exist (libraryProblems) and are tagged for that condition.
  const interventionById = new Map(interventions.map((i) => [i.id, i] as const));
  const planByCondition = new Map(planLibraries.map((pl) => [pl.conditionId, pl] as const));
  for (const pl of planLibraries) {
    const where = `plans/${pl.conditionId}`;
    const cond = conditions.find((c) => c.id === pl.conditionId);
    if (!cond) {
      p.push(`${where}: unknown condition ${pl.conditionId}`);
      continue;
    }
    for (const prob of pl.problems)
      for (const o of prob.shortTermObjectives)
        for (const iid of o.interventionIds) {
          const i = interventionById.get(iid);
          if (i && !i.conditions.includes(pl.conditionId))
            p.push(`${where}: objective ${o.id} uses ${iid}, which does not list ${pl.conditionId} in its conditions`);
        }
    // G6: a substance-use plan and its condition agree on the Part 2 flag.
    if (pl.sud !== cond.sud) p.push(`${where}: sud ${pl.sud} but conditions/${cond.id} sud ${cond.sud} (G6)`);
  }

  for (const c of conditions) {
    const where = `conditions/${c.id}`;
    if (!planByCondition.has(c.id)) p.push(`${where}: no plan library in content/plans`);
    if (c.handouts.length === 0) p.push(`${where}: no client handout linked (every condition needs at least one)`);
    const linked = interventionsFor(c.id).length;
    if (linked < MIN_INTERVENTIONS_PER_CONDITION)
      p.push(`${where}: only ${linked} library interventions list this condition (at least ${MIN_INTERVENTIONS_PER_CONDITION} expected)`);
    for (const code of c.icd10cm) if (!ICD10CM_CODE.test(code.code)) p.push(`${where}: malformed ICD-10-CM code ${code.code}`);
    for (const code of c.icd11) if (!ICD11_CODE.test(code.code)) p.push(`${where}: malformed ICD-11 code ${code.code}`);
    // G6: substance-use content carries the exact Part 2 notice.
    if (c.sud && !c.summary.includes(PART2_NOTICE)) p.push(`${where}: sud condition summary must include the 42 CFR Part 2 notice (G6)`);
    // G3: text shown as a flag or comorbidity note on a suggestion never reads as a verdict.
    const surfaced: [string, string][] = [
      ["durationGate.note", c.durationGate.note],
      ...c.requiredFeatures.map((r): [string, string] => [`requiredFeatures ${r.symptomId}`, r.note]),
      ...c.redFlagRules.map((r): [string, string] => [`redFlagRules ${r.type}`, r.message]),
      ...c.ruleOuts.map((r): [string, string] => [`ruleOuts ${r.label}`, r.label]),
      ...c.comorbidities.map((co): [string, string] => [`comorbidities ${co.label}`, co.note]),
    ];
    for (const [field, text] of surfaced) if (VERDICT_WORDS.test(text)) p.push(`${where}: ${field} reads as a verdict (G3): "${text.slice(0, 60)}"`);
    // A red-flag cap must not stop the full picture from reaching "strong" when the flag is one of its features.
    for (const r of c.redFlagRules) {
      if (!r.capAt) continue;
      const capped = c.features.some((f) => lexicon.symptoms.find((s) => s.id === f.symptomId)?.redFlag === r.type);
      if (capped) p.push(`${where}: redFlagRules ${r.type} caps a red flag that is also one of its own features`);
    }
  }

  // G6: SUD handouts are only linked from SUD conditions or interventions that list a SUD condition.
  const sudHandouts = new Set(handouts.filter((h) => h.sud).map((h) => h.id));
  const sudConditions = new Set(conditions.filter((c) => c.sud).map((c) => c.id));
  for (const c of conditions)
    for (const h of c.handouts) if (sudHandouts.has(h) && !c.sud) p.push(`conditions/${c.id}: links SUD handout ${h} but is not marked sud (G6)`);
  for (const i of interventions)
    for (const h of i.handoutIds)
      if (sudHandouts.has(h) && !i.conditions.some((c) => sudConditions.has(c)))
        p.push(`interventions/${i.id}: links SUD handout ${h} but lists no substance-use condition (G6)`);

  // Client topics (content/topics.json): every "skill to try" is a real handout (which handouts suit which topic,
  // including the tobacco exception for the urge log, is checked in tests/unit/topics.test.ts).
  const handoutIds = new Set(handouts.map((h) => h.id));
  for (const t of HealthTopicsFileSchema.parse(topicsJson).topics)
    for (const id of t.handoutIds) if (!handoutIds.has(id)) p.push(`topics.json/${t.id}: unknown handout ${id}`);

  // Lexicon: every symptom is scored by some condition, is a red flag, or is a cultural concept (never scored).
  const used = new Set(conditions.flatMap((c) => c.features.map((f) => f.symptomId)));
  for (const s of lexicon.symptoms) {
    const where = `symptoms.json ${s.id}`;
    if (!used.has(s.id) && !s.redFlag && s.category !== "cultural") p.push(`${where}: not used by any condition`);
    if (s.category === "cultural" && used.has(s.id)) p.push(`${where}: cultural concept must not be scored`);
    if (new Set(s.synonyms).size !== s.synonyms.length) p.push(`${where}: duplicate synonym`);
    for (const syn of s.synonyms) if (syn !== syn.toLowerCase()) p.push(`${where}: synonym "${syn}" must be lowercase`);
    if (/\(|\)|;|disorder|DSM|ICD/.test(s.clientLabel)) p.push(`${where}: clientLabel must be plain language without diagnostic terms (G3)`);
    // Every synonym, typed on its own, is recognized as this symptom (no collision with another entry).
    for (const syn of s.synonyms) {
      const sample = syn.includes("...")
        ? syn
            .split("...")
            .map((part) => part.split("|")[0]?.trim() ?? "")
            .join(" ")
        : syn;
      const text = CASE_RESTRICTED_ABBREVIATIONS.has(sample) ? sample.toUpperCase() : sample;
      if (!matchSymptoms(text, lexicon.symptoms).matches.some((m) => m.symptomId === s.id))
        p.push(`${where}: synonym "${sample}" is not recognized as this symptom`);
    }
  }

  // Formulations: curated factors, behavior functions and links. Folders owned by other sections are checked once they exist.
  const folderIds = (dir: string) => {
    const abs = path.resolve(__dirname, "../content", dir);
    return existsSync(abs) ? new Set(readdirSync(abs).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5))) : undefined;
  };
  p.push(
    ...formulationProblems(formulations, {
      interventions: new Set(interventions.map((i) => i.id)),
      handouts: handoutIds,
      conditions: conditionIds,
      legal: new Set(legalTopics.map((t) => t.id)),
      sudHandouts,
      sudConditions,
      licenses: licenses.items,
      orientations: folderIds("orientations"),
      practice: folderIds("practice"),
      populations: folderIds("populations"),
    }),
  );

  // Orientation profiles: every intervention maps to a profile (care, harm-reduction and safety steps excepted),
  // techniques, ethics topics and handouts resolve (orientationProblems), and links into folders owned by other
  // sections resolve once those folders exist.
  p.push(...orientationProblems());
  const orientationLinkFolders = [
    ["formulations", "formulation", (o: (typeof orientations)[number]) => o.formulationIds],
    ["practice", "practice guide", (o: (typeof orientations)[number]) => o.relatedPracticeIds],
    ["populations", "population", (o: (typeof orientations)[number]) => o.relatedPopulationIds],
  ] as const;
  for (const [dir, label, idsOf] of orientationLinkFolders) {
    const known = folderIds(dir);
    if (known) for (const o of orientations) for (const id of idsOf(o)) if (!known.has(id)) p.push(`orientations/${o.id}: unknown ${label} ${id}`);
  }

  // Plan libraries and modules: formulation targets, links, module interventions and measures, Part 2 tagging and
  // problem ids that stay unique when a module joins a library (src/lib/plan-modules.ts). Every module file loads.
  p.push(
    ...planContentProblems(planLibraries, planModules, {
      interventions: new Map(interventions.map((i) => [i.id, i] as const)),
      measures: new Set(measures.map((m) => m.id)),
      conditions: conditionIds,
      handouts: handoutIds,
      sudHandouts,
      formulationTargets: new Set(FORMULATION_TARGET_IDS),
      formulations: new Set(formulations.map((f) => f.id)),
      practice: folderIds("practice"),
    }),
  );
  const loadedModules = new Set(planModules.map((m) => m.id));
  for (const id of folderIds("plans/modules") ?? []) if (!loadedModules.has(id)) p.push(`plans/modules/${id}: not loaded (add it to src/lib/plan-modules.ts)`);

  // Practice guides: links into the library, pending measures registered in licenses.json and Part 2 tagging
  // (src/lib/practice.ts). Population links are checked once content/populations exists.
  p.push(
    ...practiceProblems(practiceGuides, {
      interventions: new Set(interventions.map((i) => i.id)),
      handouts: handoutIds,
      formulations: new Set(formulations.map((f) => f.id)),
      legal: new Set(legalTopics.map((t) => t.id)),
      sudHandouts,
      licenses: licenses.items,
      populations: folderIds("populations"),
    }),
  );

  // Medicine effects (content/care): curated medication links and Part 2 tagging (src/lib/schemas-care.ts).
  p.push(...medicationEffectProblems());

  // Population profiles (content/populations): links into the library, referral entries and kinds, pending measures
  // registered in licenses.json and Part 2 tagging (src/lib/populations.ts).
  p.push(...populationProblems());

  // Legal and ethics-practice topics: seeAlso links resolve and link-out measures are registered in licenses.json (G7).
  p.push(...legalTopicLinkProblems(legalTopics, licenses.items));

  // Handout wiring: Spanish version and at least one page that offers each handout (warnings are printed by main).
  p.push(...contentWiring().problems);
  p.push(...evidenceGradeProblems(interventionsRaw));

  // Wording guardrails over every clinical item loaded by either loader.
  const items: [string, unknown][] = [
    ["symptoms.json", lexicon],
    ...conditions.map((c): [string, unknown] => [`conditions/${c.id}`, c]),
    ...interventions.map((i): [string, unknown] => [`interventions/${i.id}`, i]),
    ...planLibraries.map((pl): [string, unknown] => [`plans/${pl.conditionId}`, pl]),
    ...handouts.map((h): [string, unknown] => [`handouts/${h.id}`, h]),
    ...followUpFiles.map((f): [string, unknown] => [`follow-ups/${f.domain}`, f]),
    ["trigger-objects.json", triggerObjectsJson],
    ...formulations.map((f): [string, unknown] => [`formulations/${f.id}`, f]),
    ...orientations.map((o): [string, unknown] => [`orientations/${o.id}`, o]),
    ...planModules.map((m): [string, unknown] => [`plans/modules/${m.id}`, m]),
    ...practiceGuides.map((g): [string, unknown] => [`practice/${g.id}`, g]),
    ["care/medication-effects.json", medicationEffectsFile],
    ...populations.map((pop): [string, unknown] => [`populations/${pop.id}`, pop]),
    ...ethicsCodes.map((e): [string, unknown] => [`ethics/${e.id}`, e]),
    ...legalTopics.map((t): [string, unknown] => [`legal/${t.id}`, t]),
  ];
  for (const [where, item] of items) {
    const body = JSON.stringify(item);
    for (const [re, label] of BANNED_CONTENT) if (re.test(body)) p.push(`${where}: banned wording (${label})`);
    for (const text of stringsOf(item))
      for (const [res, label] of CLOSE_PARAPHRASE)
        if (res.every((re) => re.test(text))) p.push(`${where}: banned wording (${label}) in "${text.slice(0, 80)}"`);
  }
  return p;
}

function main(): void {
  const release = process.argv.includes("--release");
  const report = process.argv.includes("--report");
  const audit = auditContent(path.resolve(__dirname, "../content"), { release });
  const problems = [...contentProblems(), ...crossContentProblems(), ...audit.problems];

  for (const w of audit.warnings) console.warn(`warning: ${w}`);
  // Report-only queues: counts by default, every line with --report.
  const queues: [string, readonly string[]][] = [
    ["handout wiring to review", contentWiring().warnings],
    ["clinical files awaiting clinician sign-off", audit.review.clinical],
    ["files with Spanish awaiting human review", audit.review.translation],
    ["evidence grades to re-check", audit.review.staleEvidence],
  ];
  for (const [label, lines] of queues) {
    if (!lines.length) continue;
    console.log(`report: ${lines.length} ${label}${report ? ":\n  " + lines.join("\n  ") : " (--report lists them)"}`);
  }
  if (problems.length) {
    console.error("Content validation failed:\n- " + problems.join("\n- "));
    process.exit(1);
  }
  const byKind = (k: string) => audit.files.filter((f) => f.kind === k).length;
  console.log(
    `Content OK: ${audit.files.length} files (${byKind("clinical")} clinical, ${byKind("data")} data, ${byKind("registry")} registries). ` +
      `Knowledge base: ${lexicon.symptoms.length} symptoms, ${conditions.length} conditions, ${measures.length} built-in measures, ` +
      `${handouts.length} handouts, ${stats.length} stats. Library: ${interventions.length} interventions, ` +
      `${planLibraries.length} plans, ${ethicsCodes.length} ethics codes, ${legalTopics.length} legal topics.`,
  );
}

const isCli = typeof require !== "undefined" && typeof module !== "undefined" && require.main === module;
if (isCli) main();
