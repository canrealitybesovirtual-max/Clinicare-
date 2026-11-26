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
import { matchSymptoms, normalizeText } from "@/lib/matcher";
import { RedFlagType } from "@/lib/schemas";
import { scoreConditions } from "@/lib/scoring";
import type { ScoringInput } from "@/lib/types";

const ROOT = path.resolve(__dirname, "../..");
const CONTENT_DIR = path.join(ROOT, "content");
const TODAY = "2026-11-26";
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
    expect(conditions.map((c) => c.id).sort()).toEqual(
      ["agoraphobia", "generalized-anxiety-disorder", "major-depressive-disorder", "panic-disorder", "ptsd"].sort(),
    );
    expect(measures.length).toBeGreaterThan(0);
    expect(handouts.map((h) => h.id)).toContain("pmr-homework");
    expect(stats.length).toBeGreaterThan(0);
    expect(crisisLines.countries.length).toBeGreaterThan(0);
  });

  it("has no cross-reference problems (contentProblems() is empty)", () => {
    expect(contentProblems()).toEqual([]);
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

describe("symptom lexicon", () => {
  const used = new Set(conditions.flatMap((c) => c.features.map((f) => f.symptomId)));

  it("has no unused symptom: each one is a condition feature or a red flag", () => {
    const unused = lexicon.symptoms.filter((s) => !used.has(s.id) && !s.redFlag).map((s) => s.id);
    expect(unused).toEqual([]);
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
        const ids = matchSymptoms(text, lexicon.symptoms).matches.map((m) => m.symptomId);
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
