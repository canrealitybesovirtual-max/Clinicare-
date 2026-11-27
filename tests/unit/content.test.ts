/**
 * Content integrity and guardrail checks over the REAL curated content (not fixtures).
 * G1 original wording, G7 measure licensing, G9 red flags, G10 governance, G13 stats.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  conditions,
  contentProblems,
  crisisLines,
  getCondition,
  getMeasure,
  getStat,
  getSymptom,
  isMeasureLicensed,
  isStatStale,
  lexicon,
  licenses,
  measures,
  stats,
} from "@/lib/content";
import { allConditions, getAnyHandout as getHandout, getPlanLibrary, handouts, interventions, interventionsFor, planLibraries } from "@/lib/library";
import { CASE_RESTRICTED_ABBREVIATIONS, matchSymptoms, normalizeText } from "@/lib/matcher";
import { RedFlagType } from "@/lib/schemas";
import { scoreConditions } from "@/lib/scoring";
import type { ScoringInput } from "@/lib/types";
import { MIN_INTERVENTIONS_PER_CONDITION, PART2_NOTICE, crossContentProblems } from "../../scripts/validate-content";

const ROOT = path.resolve(__dirname, "../..");
const CONTENT_DIR = path.join(ROOT, "content");
const TODAY = "2026-11-27";

/** The 29 adult conditions in the knowledge base. */
const CONDITION_IDS = [
  "adjustment-disorder",
  "adult-adhd",
  "agoraphobia",
  "alcohol-use-disorder",
  "anorexia-nervosa",
  "binge-eating-disorder",
  "bipolar-i-disorder",
  "bipolar-ii-disorder",
  "body-dysmorphic-disorder",
  "borderline-personality-disorder",
  "bulimia-nervosa",
  "cannabis-use-disorder",
  "cyclothymic-disorder",
  "generalized-anxiety-disorder",
  "hoarding-disorder",
  "illness-anxiety-disorder",
  "insomnia-disorder",
  "major-depressive-disorder",
  "obsessive-compulsive-disorder",
  "opioid-use-disorder",
  "panic-disorder",
  "persistent-depressive-disorder",
  "prolonged-grief-disorder",
  "ptsd",
  "schizophrenia",
  "social-anxiety-disorder",
  "somatic-symptom-disorder",
  "specific-phobia",
  "stimulant-use-disorder",
];
/** Substance-use conditions: Part 2 banner, Part 2 export notice and sud plans (G6). */
const SUD_IDS = ["alcohol-use-disorder", "cannabis-use-disorder", "opioid-use-disorder", "stimulant-use-disorder"];
const ISO = /^\d{4}-\d{2}-\d{2}$/;

const neutral = (symptomIds: string[]): ScoringInput => ({
  symptomIds,
  duration: "gte6m",
  impairment: "yes",
  substancePossible: "no",
  medicalPossible: "no",
});

function jsonFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return jsonFiles(full);
    return name.endsWith(".json") ? [full] : [];
  });
}

describe("content loads and cross-references", () => {
  it("parses every content file through content.ts", () => {
    expect(lexicon.symptoms.length).toBeGreaterThanOrEqual(10);
    expect(conditions.map((c) => c.id).sort()).toEqual(CONDITION_IDS);
    expect(measures.length).toBeGreaterThan(0);
    expect(handouts.map((h) => h.id)).toContain("pmr-homework");
    expect(stats.length).toBeGreaterThan(0);
    expect(crisisLines.countries.length).toBeGreaterThan(0);
  });

  it("has no cross-reference problems (contentProblems() is empty)", () => {
    expect(contentProblems()).toEqual([]);
  });

  it("loads every condition file from the generated index, the same set library.ts sees", () => {
    const files = readdirSync(path.join(CONTENT_DIR, "conditions"))
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.replace(/\.json$/, ""))
      .sort();
    expect(files).toEqual(CONDITION_IDS);
    expect(conditions.map((c) => c.id)).toEqual(files);
    expect(allConditions.map((c) => c.id)).toEqual(conditions.map((c) => c.id));
  });

  it("has no library cross-reference problems either (validate-content covers ALL content, G10)", () => {
    expect(crossContentProblems()).toEqual([]);
  });

  it("resolves every id a condition points to", () => {
    for (const c of conditions) {
      for (const f of c.features) expect(getSymptom(f.symptomId), `${c.id} -> ${f.symptomId}`).toBeDefined();
      for (const m of c.measures) expect(getMeasure(m), `${c.id} -> measure ${m}`).toBeDefined();
      for (const h of c.handouts) expect(getHandout(h), `${c.id} -> handout ${h}`).toBeDefined();
      for (const s of c.statIds) expect(getStat(s), `${c.id} -> stat ${s}`).toBeDefined();
      for (const co of c.comorbidities)
        if (co.conditionId) expect(getCondition(co.conditionId), `${c.id} -> ${co.conditionId}`).toBeDefined();
    }
  });
});

describe("governance (G10): sources, license, lastVerified, reviewedBy", () => {
  const items: { where: string; item: { sources: unknown[]; license: string; lastVerified: string; reviewedBy: string } }[] = [
    { where: "symptoms.json", item: lexicon },
    ...conditions.map((c) => ({ where: `conditions/${c.id}`, item: c })),
    ...measures.map((m) => ({ where: `measures/${m.id}`, item: m })),
    ...handouts.map((h) => ({ where: `handouts/${h.id}`, item: h })),
    ...stats.map((s) => ({ where: `stats/${s.id}`, item: s })),
  ];

  it.each(items)("$where has sources[], license, a past lastVerified and reviewedBy", ({ item }) => {
    expect(item.sources.length).toBeGreaterThan(0);
    expect(item.license.trim().length).toBeGreaterThan(1);
    expect(item.lastVerified).toMatch(ISO);
    expect(item.lastVerified <= TODAY).toBe(true);
    expect(item.reviewedBy.trim().length).toBeGreaterThan(0);
  });

  it("uses https sources only", () => {
    for (const { where, item } of items)
      for (const s of item.sources as { url: string }[]) expect(s.url, where).toMatch(/^https:\/\//);
  });
});

describe("conditions", () => {
  it.each(conditions)("$id has ICD-10-CM and ICD-11 codes and a DSM-5-TR pointer (no DSM text)", (c) => {
    expect(c.icd10cm.length).toBeGreaterThan(0);
    expect(c.icd11.length).toBeGreaterThan(0);
    for (const code of c.icd10cm) expect(code.code).toMatch(/^[A-Z]\d{2}(\.\w{1,4})?$/);
    for (const code of c.icd11) expect(code.code).toMatch(/^[0-9A-Z]{4}(\.[0-9A-Z]{1,3})?$/);
    expect(c.dsmPointer).toContain("See DSM-5-TR");
    expect(c.licensedDsm).toBe(false);
    expect(c.wileyLicensed).toBe(false);
  });

  it.each(conditions)("$id has cultural notes, sources, rule-outs, differentials and interventions", (c) => {
    expect(c.culturalNotes.length).toBeGreaterThan(0);
    for (const n of c.culturalNotes) expect(n.trim().length).toBeGreaterThanOrEqual(10);
    expect(c.sources.length).toBeGreaterThan(0);
    expect(c.ruleOuts.some((r) => r.type === "substance")).toBe(true);
    expect(c.ruleOuts.some((r) => r.type === "medical")).toBe(true);
    expect(c.differentials.length).toBeGreaterThanOrEqual(2);
    expect(c.interventions.length).toBeGreaterThan(0);
  });

  it.each(conditions)("$id has a sensible feature set (core features, minCore, weights)", (c) => {
    const core = c.features.filter((f) => f.kind === "core");
    const assoc = c.features.filter((f) => f.kind === "associated");
    expect(core.length).toBeGreaterThanOrEqual(c.minCore);
    expect(assoc.length).toBeGreaterThan(0);
    // A core feature never weighs less than an associated one: associated items support, they never define.
    const minCoreWeight = Math.min(...core.map((f) => f.weight));
    const maxAssocWeight = Math.max(...assoc.map((f) => f.weight));
    expect(minCoreWeight).toBeGreaterThanOrEqual(maxAssocWeight);
    // The heaviest core feature outweighs every associated feature.
    expect(Math.max(...core.map((f) => f.weight))).toBeGreaterThan(maxAssocWeight);
  });

  it("never lets one or two features alone produce a 'strong' suggestion", () => {
    for (const c of conditions) {
      const ids = c.features.map((f) => f.symptomId);
      for (let i = 0; i < ids.length; i++) {
        for (let j = i; j < ids.length; j++) {
          const pair = [...new Set([ids[i] as string, ids[j] as string])];
          const r = scoreConditions(neutral(pair), conditions, lexicon.symptoms);
          for (const s of r.suggestions) expect(s.strength, `${pair.join(" + ")} -> ${s.conditionId}`).not.toBe("strong");
        }
      }
    }
  });

  it("never suggests a condition from associated features alone", () => {
    for (const c of conditions) {
      const assoc = c.features.filter((f) => f.kind === "associated").map((f) => f.symptomId);
      const r = scoreConditions(neutral(assoc), [c], lexicon.symptoms);
      expect(r.suggestions, c.id).toEqual([]);
      expect(r.status).toBe("insufficient");
    }
  });

  it("can reach 'strong' when the full picture is present (all features)", () => {
    for (const c of conditions) {
      const r = scoreConditions(neutral(c.features.map((f) => f.symptomId)), [c], lexicon.symptoms);
      expect(r.suggestions[0]?.strength, c.id).toBe("strong");
    }
  });
});

describe("expansion conditions (codes, measures, Part 2, cultural notes, interventions)", () => {
  const cond = (id: string) => {
    const c = getCondition(id);
    if (!c) throw new Error(`missing condition ${id}`);
    return c;
  };
  const codes = (id: string) => cond(id).icd10cm.map((x) => x.code);
  const icd11 = (id: string) => cond(id).icd11.map((x) => x.code);

  // ICD-10-CM codes and titles were checked against the NLM Clinical Table Search Service on 2026-11-27.
  it.each([
    ["social-anxiety-disorder", ["F40.10", "F40.11"], ["6B04"]],
    ["obsessive-compulsive-disorder", ["F42.2", "F42.8", "F42.9"], ["6B20", "6B20.0", "6B20.1"]],
    ["alcohol-use-disorder", ["F10.10", "F10.11", "F10.20", "F10.21"], ["6C40.1", "6C40.2"]],
    ["insomnia-disorder", ["F51.01", "G47.00"], ["7A00", "7A01"]],
    ["persistent-depressive-disorder", ["F34.1"], ["6A72"]],
    ["adjustment-disorder", ["F43.20", "F43.21", "F43.22", "F43.23", "F43.24", "F43.25"], ["6B43"]],
    ["prolonged-grief-disorder", ["F43.81"], ["6B42"]],
  ] as [string, string[], string[]][])("%s carries the expected ICD-10-CM and ICD-11 codes", (id, ten, eleven) => {
    expect(codes(id)).toEqual(ten);
    expect(icd11(id)).toEqual(eleven);
  });

  it("specific phobia uses the F40.2xx family and ICD-11 6B03", () => {
    expect(codes("specific-phobia").length).toBeGreaterThanOrEqual(10);
    for (const c of codes("specific-phobia")) expect(c).toMatch(/^F40\.2\d{2}$/);
    expect(icd11("specific-phobia")).toEqual(["6B03"]);
  });

  it("explains the F51.01 / G47.00 choice for insomnia disorder", () => {
    const note = cond("insomnia-disorder").specifiers.find((s) => /F51\.01/.test(s.label));
    expect(note?.note).toMatch(/DSM-5-TR lists F51\.01/);
    expect(note?.note).toMatch(/G47\.00/);
  });

  it("builds in only GAD-7 and PHQ-9; SPIN, Y-BOCS, AUDIT and ISI stay link-out 'license pending' (G7)", () => {
    for (const id of CONDITION_IDS) for (const m of cond(id).measures) expect(["gad-7", "phq-9"], `${id} -> ${m}`).toContain(m);
    const pending = (id: string) => cond(id).measuresPending.map((m) => m.licenseKey);
    expect(pending("social-anxiety-disorder")).toContain("SPIN");
    expect(pending("obsessive-compulsive-disorder")).toContain("Y-BOCS");
    expect(pending("alcohol-use-disorder")).toContain("AUDIT");
    expect(pending("insomnia-disorder")).toContain("ISI");
    for (const id of CONDITION_IDS)
      for (const m of cond(id).measuresPending) {
        expect(licenses.items[m.licenseKey]?.status, `${id} -> ${m.licenseKey}`).not.toBe("confirmed");
        expect(m.note).toMatch(/License pending/);
      }
  });

  it("marks exactly the substance-use conditions as Part 2 content with the exact notice (G6)", () => {
    expect(conditions.filter((c) => c.sud).map((c) => c.id)).toEqual(SUD_IDS);
    expect(PART2_NOTICE).toBe("42 CFR Part 2 prohibits unauthorized use or disclosure of these records.");
    for (const id of SUD_IDS) {
      expect(cond(id).summary, id).toContain(PART2_NOTICE);
      expect(getPlanLibrary(id)?.sud, id).toBe(true);
    }
    for (const c of conditions) expect(getPlanLibrary(c.id)?.sud ?? false, c.id).toBe(c.sud);
    expect(cond("alcohol-use-disorder").redFlagRules.map((r) => r.type)).toContain("withdrawal");
  });

  it("keeps the 'See DSM-5-TR' pointer and never stores DSM text (G1)", () => {
    for (const id of CONDITION_IDS) {
      expect(cond(id).dsmPointer).toMatch(/^See DSM-5-TR: /);
      expect(cond(id).license).toBe("original");
    }
  });

  it.each([
    ["social-anxiety-disorder", /taijin kyofusho/i],
    ["obsessive-compulsive-disorder", /scrupulosity/i],
    ["obsessive-compulsive-disorder", /faith/i],
    ["prolonged-grief-disorder", /mourning customs/i],
    ["alcohol-use-disorder", /drinking norms/i],
  ] as [string, RegExp][])("%s has a culturally specific note matching %s", (id, re) => {
    expect(cond(id).culturalNotes.some((n) => re.test(n))).toBe(true);
  });

  it("recognizes taijin kyofusho as a cultural idiom (shown, never scored)", () => {
    const ids = matchSymptoms("Describes taijin kyofusho since moving abroad.", lexicon.symptoms).matches.map((m) => m.symptomId);
    expect(ids).toContain("cultural-idiom-of-distress");
  });

  it.each([
    ["obsessive-compulsive-disorder", "exposure-and-response-prevention"],
    ["insomnia-disorder", "cbti-stimulus-control"],
    ["insomnia-disorder", "cbti-sleep-restriction"],
    ["alcohol-use-disorder", "motivational-interviewing"],
    ["alcohol-use-disorder", "relapse-prevention-planning"],
    ["alcohol-use-disorder", "urge-surfing"],
    ["alcohol-use-disorder", "contingency-management"],
    ["alcohol-use-disorder", "medication-referral"],
    ["prolonged-grief-disorder", "grief-focused-therapy"],
    ["specific-phobia", "graded-in-vivo-exposure"],
    ["social-anxiety-disorder", "graded-in-vivo-exposure"],
    ["social-anxiety-disorder", "social-anxiety-cognitive-techniques"],
    ["persistent-depressive-disorder", "behavioral-activation"],
    ["adjustment-disorder", "problem-solving"],
  ])("the interventions library links %s to %s", (conditionId, interventionId) => {
    expect(interventionsFor(conditionId).map((i) => i.id)).toContain(interventionId);
  });

  // ICD-10-CM codes and titles were checked against the NLM Clinical Table Search Service on 2026-11-27 (codes only).
  it.each([
    ["bipolar-i-disorder", /^F31\.(1[0-3]|2|30|4|5|60|70|9)$/, ["6A60"]],
    ["bipolar-ii-disorder", /^F31\.81$/, ["6A61"]],
    ["cyclothymic-disorder", /^F34\.0$/, ["6A62"]],
    ["adult-adhd", /^F90\.[01289]$/, ["6A05"]],
    ["borderline-personality-disorder", /^F60\.3$/, ["6D10", "6D11.5"]],
    ["anorexia-nervosa", /^F50\.0(0|1[0-49]|2[0-49])$/, ["6B80"]],
    ["bulimia-nervosa", /^F50\.2[0-5]$/, ["6B81"]],
    ["binge-eating-disorder", /^F50\.81[0-49]$/, ["6B82"]],
    ["schizophrenia", /^F20\.(0|1|2|3|5|81|89|9)$/, ["6A20"]],
    ["illness-anxiety-disorder", /^F45\.21$/, ["6B23"]],
    ["somatic-symptom-disorder", /^F45\.1$/, ["6C20"]],
    ["hoarding-disorder", /^F42\.3$/, ["6B24"]],
    ["body-dysmorphic-disorder", /^F45\.22$/, ["6B21"]],
    ["cannabis-use-disorder", /^F12\.(1[01]|2[013]|90)$/, ["6C41.1", "6C41.2"]],
    ["opioid-use-disorder", /^F11\.(1[01]|2[013]|90)$/, ["6C43.1", "6C43.2"]],
    ["stimulant-use-disorder", /^F1[45]\.(10|2[01])$/, ["6C45.1", "6C45.2", "6C46.1", "6C46.2"]],
  ] as [string, RegExp, string[]][])("%s carries its ICD-10-CM family and ICD-11 codes", (id, ten, eleven) => {
    expect(codes(id).length).toBeGreaterThan(0);
    for (const c of codes(id)) expect(c, id).toMatch(ten);
    expect(icd11(id)).toEqual(eleven);
  });

  it("gives every condition at least one client handout that exists, and Part 2 handouts only to substance-use conditions", () => {
    for (const c of conditions) {
      expect(c.handouts.length, c.id).toBeGreaterThan(0);
      for (const h of c.handouts) {
        const handout = getHandout(h);
        expect(handout, `${c.id} -> ${h}`).toBeDefined();
        if (handout?.sud) expect(c.sud, `${c.id} -> SUD handout ${h}`).toBe(true);
      }
    }
  });

  it("gives every new condition except the two bodily-distress patterns a US statistic with a data year (G13)", () => {
    // No US national estimate was found for illness anxiety or somatic symptom disorder; none is invented.
    const noUsStat = new Set(["illness-anxiety-disorder", "somatic-symptom-disorder"]);
    for (const c of conditions) {
      const us = c.statIds.map((id) => getStat(id)).filter((st) => st?.region === "US");
      if (noUsStat.has(c.id)) expect(c.statIds, c.id).toEqual([]);
      else if (["insomnia-disorder", "adjustment-disorder", "prolonged-grief-disorder", "persistent-depressive-disorder"].includes(c.id)) continue;
      else {
        expect(us.length, c.id).toBeGreaterThan(0);
        for (const st of us) expect(st?.dataYear, `${c.id} -> ${st?.id}`).toMatch(/\d{4}/);
      }
    }
  });

  it.each([
    ["bipolar-i-disorder", "interpersonal-social-rhythm-therapy"],
    ["bipolar-i-disorder", "bipolar-psychoeducation"],
    ["schizophrenia", "coordinated-specialty-care-referral"],
    ["schizophrenia", "cbt-for-psychosis"],
    ["schizophrenia", "family-psychoeducation-psychosis"],
    ["borderline-personality-disorder", "dbt-distress-tolerance"],
    ["borderline-personality-disorder", "mentalization-based-treatment"],
    ["borderline-personality-disorder", "schema-therapy"],
    ["anorexia-nervosa", "eating-disorder-medical-monitoring"],
    ["bulimia-nervosa", "cbt-e-eating-disorders"],
    ["adult-adhd", "cbt-adult-adhd"],
    ["illness-anxiety-disorder", "cbt-health-anxiety"],
    ["hoarding-disorder", "cbt-hoarding"],
    ["body-dysmorphic-disorder", "cbt-bdd"],
    ["body-dysmorphic-disorder", "habit-reversal-training"],
    ["specific-phobia", "applied-tension"],
    ["generalized-anxiety-disorder", "imaginal-exposure"],
    ["major-depressive-disorder", "mindfulness-based-cognitive-therapy"],
    ["major-depressive-disorder", "couples-relationship-skills"],
    ["adjustment-disorder", "existential-meaning-exploration"],
    ["opioid-use-disorder", "moud-referral"],
    ["opioid-use-disorder", "naloxone-overdose-education"],
    ["stimulant-use-disorder", "contingency-management"],
    ["cannabis-use-disorder", "motivational-interviewing"],
  ])("the interventions library links %s to %s", (conditionId, interventionId) => {
    expect(interventionsFor(conditionId).map((i) => i.id)).toContain(interventionId);
  });

  it("covers the major orientations and protocols (each with at least one condition)", () => {
    const ids = new Set(interventions.map((i) => i.id));
    for (const id of [
      "cognitive-processing-therapy", "prolonged-exposure", "emdr", "written-exposure-therapy", "exposure-and-response-prevention",
      "cbti-stimulus-control", "mindfulness-based-cognitive-therapy", "schema-therapy", "emotion-focused-chair-work",
      "short-term-psychodynamic-exploration", "person-centered-reflective-listening", "gestalt-awareness-experiments",
      "existential-meaning-exploration", "motivational-interviewing", "relapse-prevention-planning", "contingency-management",
      "interpersonal-psychotherapy", "genogram-family-systems", "couples-relationship-skills", "emotionally-focused-couples-work",
      "compassion-focused-imagery", "sleep-hygiene-education", "grief-focused-therapy", "interpersonal-social-rhythm-therapy",
      "bipolar-psychoeducation", "family-psychoeducation-psychosis", "dbt-distress-tolerance", "dbt-emotion-regulation-opposite-action",
      "dbt-interpersonal-effectiveness", "dbt-mindfulness-skills", "behavioral-experiments", "interoceptive-exposure",
      "imaginal-exposure", "applied-tension", "thought-record", "habit-reversal-training",
    ])
      expect(ids.has(id), id).toBe(true);
  });

  it("keeps trained-only protocols marked as such", () => {
    for (const id of ["emdr", "schema-therapy", "mentalization-based-treatment", "cbt-for-psychosis", "emotionally-focused-couples-work"])
      expect(interventions.find((i) => i.id === id)?.trainingRequired, id).toMatch(/trained|training/i);
  });

  it("recognizes the phobia subtypes alongside the general fear, as one associated slot (no double counting of the fear)", () => {
    const phobia = cond("specific-phobia");
    const subtypes = ["fear-animals", "fear-heights", "fear-flying", "fear-blood-injection", "fear-enclosed-spaces", "fear-natural-environment"];
    for (const id of subtypes) {
      const f = phobia.features.find((x) => x.symptomId === id);
      expect(f, id).toMatchObject({ kind: "associated", weight: 1, group: "phobia-type" });
    }
    const ids = (t: string) => matchSymptoms(t, lexicon.symptoms).matches.map((m) => m.symptomId);
    expect(ids("She is scared of spiders.")).toEqual(expect.arrayContaining(["fear-animals"]));
    expect(ids("Terrified of flying since a bumpy flight.")).toEqual(expect.arrayContaining(["fear-flying", "circumscribed-fear"]));
    expect(ids("Afraid of needles and gets lightheaded at blood draws.")).toEqual(expect.arrayContaining(["fear-blood-injection", "circumscribed-fear"]));
    expect(ids("Scared of storms and thunder.")).toEqual(expect.arrayContaining(["fear-natural-environment"]));
  });

  it(`gives every condition at least ${MIN_INTERVENTIONS_PER_CONDITION} library interventions and a plan library`, () => {
    for (const id of CONDITION_IDS) {
      expect(interventionsFor(id).length, id).toBeGreaterThanOrEqual(MIN_INTERVENTIONS_PER_CONDITION);
      expect(getPlanLibrary(id), id).toBeDefined();
    }
    expect(planLibraries.map((p) => p.conditionId).sort()).toEqual(CONDITION_IDS);
  });

  it("only links interventions to real conditions, and every plan objective's interventions exist and list that condition", () => {
    const known = new Set(CONDITION_IDS);
    for (const i of interventions) for (const c of i.conditions) expect(known.has(c), `${i.id} -> ${c}`).toBe(true);
    const byId = new Map(interventions.map((i) => [i.id, i] as const));
    for (const pl of planLibraries)
      for (const prob of pl.problems)
        for (const o of prob.shortTermObjectives)
          for (const iid of o.interventionIds) {
            expect(byId.has(iid), `${pl.conditionId}/${o.id} -> ${iid}`).toBe(true);
            expect(byId.get(iid)?.conditions, `${pl.conditionId}/${o.id} -> ${iid}`).toContain(pl.conditionId);
          }
  });
});

describe("symptom lexicon", () => {
  const used = new Set(conditions.flatMap((c) => c.features.map((f) => f.symptomId)));

  it("has no unused symptom: each one is a condition feature, a red flag or a cultural concept (never scored)", () => {
    const unused = lexicon.symptoms.filter((s) => !used.has(s.id) && !s.redFlag && s.category !== "cultural").map((s) => s.id);
    expect(unused).toEqual([]);
  });

  it("never maps a cultural concept of distress to a condition", () => {
    const cultural = lexicon.symptoms.filter((s) => s.category === "cultural");
    expect(cultural.length).toBeGreaterThan(0);
    for (const s of cultural) expect(used.has(s.id), s.id).toBe(false);
  });

  it("covers every red-flag type (G9)", () => {
    const present = new Set(lexicon.symptoms.flatMap((s) => (s.redFlag ? [s.redFlag] : [])));
    for (const t of RedFlagType.options) expect(present.has(t), t).toBe(true);
  });

  it("has unique ids and lowercase, de-duplicated synonyms", () => {
    const ids = lexicon.symptoms.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of lexicon.symptoms) {
      for (const syn of s.synonyms) expect(syn, s.id).toBe(syn.toLowerCase());
      expect(new Set(s.synonyms).size, `${s.id} duplicate synonym`).toBe(s.synonyms.length);
    }
  });

  it("writes gap patterns correctly (non-empty parts and alternatives)", () => {
    for (const s of lexicon.symptoms) {
      for (const syn of s.synonyms.filter((x) => x.includes("...") || x.includes("|"))) {
        const parts = syn.split("...");
        expect(parts.length, `${s.id}: ${syn.slice(0, 40)}`).toBeGreaterThanOrEqual(2);
        for (const part of parts)
          for (const alt of part.split("|")) expect(normalizeText(alt).length, `${s.id}: empty alternative`).toBeGreaterThan(0);
      }
    }
  });

  it("recognizes every plain synonym as its own symptom (no collisions between symptoms)", () => {
    const misses: string[] = [];
    for (const s of lexicon.symptoms) {
      for (const syn of s.synonyms) {
        // A gap pattern is checked through a sample sentence made of the first alternative of each part.
        const text = syn.includes("...")
          ? syn
              .split("...")
              .map((p) => p.split("|")[0]?.trim() ?? "")
              .join(" ")
          : syn;
        // Case-restricted abbreviations (SI, HI, AVH, SOB) only match in capitals on their own.
        const sample = CASE_RESTRICTED_ABBREVIATIONS.has(text) ? text.toUpperCase() : text;
        const ids = matchSymptoms(sample, lexicon.symptoms).matches.map((m) => m.symptomId);
        if (!ids.includes(s.id)) misses.push(`${s.id}: "${text}" -> [${ids.join(", ")}]`);
      }
    }
    expect(misses).toEqual([]);
  });

  it("keeps every clientLabel short and free of diagnostic terms", () => {
    for (const s of lexicon.symptoms) {
      expect(s.clientLabel.split(/\s+/).length, s.id).toBeLessThanOrEqual(18);
      expect(s.clientLabel, s.id).not.toMatch(/\(|\)|;|disorder|DSM|ICD/);
    }
  });
});

describe("measures (G7)", () => {
  it("exposes only measures whose license is confirmed in licenses.json", () => {
    for (const m of measures) {
      expect(licenses.items[m.licenseKey]?.status, m.id).toBe("confirmed");
      expect(isMeasureLicensed(m)).toBe(true);
    }
  });

  it("treats a pending or unknown license as not built in", () => {
    const pending = Object.entries(licenses.items).find(([, v]) => v.status === "pending")?.[0];
    expect(pending).toBeDefined();
    expect(isMeasureLicensed({ licenseKey: pending as string })).toBe(false);
    expect(isMeasureLicensed({ licenseKey: "NOT-A-MEASURE" })).toBe(false);
  });

  it("ships PHQ-9 and GAD-7 in Phase 1", () => {
    expect(measures.map((m) => m.id).sort()).toEqual(["gad-7", "phq-9"]);
  });
});

describe("statistics (G13)", () => {
  it.each(stats)("$id shows a source url, publisher and data year", (s) => {
    expect(s.url).toMatch(/^https:\/\//);
    expect(s.publisher.trim().length).toBeGreaterThan(1);
    expect(s.dataYear).toMatch(/\d{4}/);
    expect(s.value.trim().length).toBeGreaterThan(0);
  });

  it("flags statistics whose data are older than 5 years", () => {
    const now = new Date(`${TODAY}T12:00:00Z`);
    for (const s of stats) {
      const newest = Math.max(...(s.dataYear.match(/\d{4}/g) ?? ["0"]).map(Number));
      expect(isStatStale(s, now), s.id).toBe(now.getFullYear() - newest > 5);
    }
    expect(isStatStale({ dataYear: "2001-2003" }, now)).toBe(true);
    expect(isStatStale({ dataYear: "2025" }, now)).toBe(false);
    expect(isStatStale({ dataYear: "unknown" }, now)).toBe(true);
  });
});

describe("crisis and safety content (G9)", () => {
  it("lists 988 for the US and findahelpline.com internationally", () => {
    const us = crisisLines.countries.find((c) => c.country === "US");
    expect(us?.crisis).toContain("988");
    expect(us?.emergency).toBe("911");
    expect(crisisLines.international.url).toContain("findahelpline.com");
  });

  it("puts crisis information on every client handout", () => {
    for (const h of handouts) {
      expect(h.safetyNote).toContain("988");
      expect(h.safetyNote.toLowerCase()).toContain("findahelpline.com");
    }
  });
});

describe("wording guardrails across every content file (G1, G3, G4, G15)", () => {
  const files = jsonFiles(CONTENT_DIR).filter((f) => !f.endsWith("licenses.json"));
  const text = files.map((f) => ({ file: path.relative(ROOT, f), body: readFileSync(f, "utf8") }));

  it("finds content files to scan", () => {
    expect(files.length).toBeGreaterThanOrEqual(12);
  });

  it.each(text)("$file has no DSM criteria structure or criteria-text phrasing (G1 heuristic)", ({ body }) => {
    expect(body).not.toMatch(/\bcriterion\b/i);
    expect(body).not.toMatch(/DSM-5(-TR)?\s+(diagnostic\s+)?criteria/i);
    expect(body).not.toMatch(/\bcriteria\s+[A-H]\b/);
  });

  it.each(text)("$file never states a final diagnosis (G3 heuristic)", ({ body }) => {
    expect(body).not.toMatch(/\bmeets (the )?(full )?criteria\b/i);
    expect(body).not.toMatch(/\b(confirms|confirmed) (the |a )?diagnosis\b/i);
    expect(body).not.toMatch(/\bthe diagnosis is\b/i);
  });

  it.each(text)("$file has no homeopathy or HIPAA certification claims (G4, G15)", ({ body }) => {
    expect(body).not.toMatch(/homeopath/i);
    expect(body).not.toMatch(/HIPAA[ -](certified|approved|certification)/i);
  });
});
