/**
 * CI gate (G1, G3, G6, G7, G10, G13). Exit 1 on any problem.
 *  1. Phase 1 content parses and cross-references cleanly (src/lib/content.ts contentProblems()): lexicon,
 *     every condition, built-in measures, Phase 1 handouts and stats.
 *  2. The whole library parses and cross-references cleanly (src/lib/library.ts libraryProblems() plus the
 *     cross-content checks below): interventions, plans, every handout, ethics codes and legal topics, and
 *     the links between them and the conditions.
 *  3. EVERY file under content/ matches a registered schema with governance (scripts/content-audit.ts).
 * `--release` also fails while any crisis line is unverified (a person must check each official site).
 */
import path from "node:path";
import { CASE_RESTRICTED_ABBREVIATIONS, matchSymptoms } from "../src/lib/matcher";
import { conditions, contentProblems, handouts, lexicon, measures, stats } from "../src/lib/content";
import {
  allConditions,
  allHandouts,
  ethicsCodes,
  interventions,
  interventionsFor,
  legalTopics,
  libraryProblems,
  planLibraries,
} from "../src/lib/library";
import { auditContent } from "./content-audit";

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

/** Text that surfaces as a suggestion flag or note must not read as a verdict (G3). */
const VERDICT_WORDS = /\b(diagnosed|diagnosis is|meets|confirmed|definitely|certainly)\b/i;

/**
 * Checks that span the Phase 1 loader (content.ts) and the full library (library.ts). Pure; returns error strings.
 * Covers every condition, intervention, plan and handout, so CI covers all content (G10).
 */
export function crossContentProblems(): string[] {
  const p: string[] = [...libraryProblems()];
  const conditionIds = new Set(conditions.map((c) => c.id));
  const libraryIds = new Set(allConditions.map((c) => c.id));

  // The two loaders must see the same condition set (both read the generated index).
  for (const id of libraryIds) if (!conditionIds.has(id)) p.push(`conditions/${id}: in library.ts but not in content.ts`);
  for (const id of conditionIds) if (!libraryIds.has(id)) p.push(`conditions/${id}: in content.ts but not in library.ts`);

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
  dupes(allHandouts, (h) => h.id, "handouts");
  dupes(ethicsCodes, (e) => e.id, "ethics");
  dupes(legalTopics, (t) => t.id, "legal");

  // Interventions point only at real conditions.
  for (const i of interventions)
    for (const c of i.conditions) if (!conditionIds.has(c)) p.push(`interventions/${i.id}: unknown condition ${c}`);

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

  const allHandoutIds = new Set(allHandouts.map((h) => h.id));
  for (const c of conditions) {
    const where = `conditions/${c.id}`;
    if (!planByCondition.has(c.id)) p.push(`${where}: no plan library in content/plans`);
    const linked = interventionsFor(c.id).length;
    if (linked < MIN_INTERVENTIONS_PER_CONDITION)
      p.push(`${where}: only ${linked} library interventions list this condition (at least ${MIN_INTERVENTIONS_PER_CONDITION} expected)`);
    for (const h of c.handouts) if (!allHandoutIds.has(h)) p.push(`${where}: unknown handout ${h}`);
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
  const sudHandouts = new Set(allHandouts.filter((h) => h.sud).map((h) => h.id));
  const sudConditions = new Set(conditions.filter((c) => c.sud).map((c) => c.id));
  for (const c of conditions)
    for (const h of c.handouts) if (sudHandouts.has(h) && !c.sud) p.push(`conditions/${c.id}: links SUD handout ${h} but is not marked sud (G6)`);
  for (const i of interventions)
    for (const h of i.handoutIds)
      if (sudHandouts.has(h) && !i.conditions.some((c) => sudConditions.has(c)))
        p.push(`interventions/${i.id}: links SUD handout ${h} but lists no substance-use condition (G6)`);

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

  // Wording guardrails over every clinical item loaded by either loader.
  const items: [string, unknown][] = [
    ["symptoms.json", lexicon],
    ...conditions.map((c): [string, unknown] => [`conditions/${c.id}`, c]),
    ...interventions.map((i): [string, unknown] => [`interventions/${i.id}`, i]),
    ...planLibraries.map((pl): [string, unknown] => [`plans/${pl.conditionId}`, pl]),
    ...allHandouts.map((h): [string, unknown] => [`handouts/${h.id}`, h]),
  ];
  for (const [where, item] of items) {
    const body = JSON.stringify(item);
    for (const [re, label] of BANNED_CONTENT) if (re.test(body)) p.push(`${where}: banned wording (${label})`);
  }
  return p;
}

function main(): void {
  const release = process.argv.includes("--release");
  const audit = auditContent(path.resolve(__dirname, "../content"), { release });
  const problems = [...contentProblems(), ...crossContentProblems(), ...audit.problems];

  for (const w of audit.warnings) console.warn(`warning: ${w}`);
  if (problems.length) {
    console.error("Content validation failed:\n- " + problems.join("\n- "));
    process.exit(1);
  }
  const byKind = (k: string) => audit.files.filter((f) => f.kind === k).length;
  console.log(
    `Content OK: ${audit.files.length} files (${byKind("clinical")} clinical, ${byKind("data")} data, ${byKind("registry")} registries). ` +
      `Knowledge base: ${lexicon.symptoms.length} symptoms, ${conditions.length} conditions, ${measures.length} built-in measures, ` +
      `${handouts.length} Phase 1 handouts, ${stats.length} stats. Library: ${interventions.length} interventions, ` +
      `${planLibraries.length} plans, ${allHandouts.length} handouts, ${ethicsCodes.length} ethics codes, ${legalTopics.length} legal topics.`,
  );
}

const isCli = typeof require !== "undefined" && typeof module !== "undefined" && require.main === module;
if (isCli) main();
