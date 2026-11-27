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
  getHandout,
  getMeasure,
  getStat,
  getSymptom,
  handouts,
  isMeasureLicensed,
  isStatStale,
  lexicon,
  licenses,
  measures,
  stats,
} from "@/lib/content";
import { allConditions, getPlanLibrary, interventions, interventionsFor, planLibraries } from "@/lib/library";
import { CASE_RESTRICTED_ABBREVIATIONS, matchSymptoms, normalizeText } from "@/lib/matcher";
import { RedFlagType } from "@/lib/schemas";
import { scoreConditions } from "@/lib/scoring";
import type { ScoringInput } from "@/lib/types";
import { MIN_INTERVENTIONS_PER_CONDITION, PART2_NOTICE, crossContentProblems } from "../../scripts/validate-content";

const ROOT = path.resolve(__dirname, "../..");
const CONTENT_DIR = path.join(ROOT, "content");
const TODAY = "2026-11-27";

/** The 13 adult conditions in the knowledge base (5 from Phase 1 plus the 8 added in the expansion). */
const CONDITION_IDS = [
  "adjustment-disorder",
  "agoraphobia",
  "alcohol-use-disorder",
  "generalized-anxiety-disorder",
  "insomnia-disorder",
  "major-depressive-disorder",
  "obsessive-compulsive-disorder",
  "panic-disorder",
  "persistent-depressive-disorder",
  "prolonged-grief-disorder",
  "ptsd",
  "social-anxiety-disorder",
  "specific-phobia",
];
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

  it("marks alcohol use disorder (only) as substance-use content with the exact Part 2 notice (G6)", () => {
    expect(conditions.filter((c) => c.sud).map((c) => c.id)).toEqual(["alcohol-use-disorder"]);
    expect(PART2_NOTICE).toBe("42 CFR Part 2 prohibits unauthorized use or disclosure of these records.");
    expect(cond("alcohol-use-disorder").summary).toContain(PART2_NOTICE);
    expect(getPlanLibrary("alcohol-use-disorder")?.sud).toBe(true);
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
