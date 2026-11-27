/**
 * Case-formulation content and the worksheet model: the curated targets plans depend on, governance and wording
 * guards, cross-file checks, the read-only session prefill, linked interventions (for clinician review), and the
 * export (no identifiers, no diagnosis, scrubbed notes, crisis box, Part 2 notice for substance use).
 */
import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { strFromU8, unzipSync } from "fflate";
import { conditions } from "@/lib/content";
import { interventions } from "@/lib/library";
import {
  FORMULATION_TARGET_IDS,
  behaviorFunctions,
  formulationFactors,
  formulationProblems,
  formulations,
  formulationsByFamily,
  getFormulation,
  worksheetFormulations,
  type FormulationRefs,
} from "@/lib/formulations";
import { FormulationSchema, type Formulation } from "@/lib/schemas-formulations";
import {
  EMPTY_DRAFT,
  hasWork,
  sessionPrefill,
  setPartText,
  suggestInterventions,
  toWorksheetTemplate,
  toggleChip,
  togglePrefill,
  worksheetDoc,
  worksheetLibrary,
  worksheetRecordsSubstanceUse,
  type WorksheetDraft,
} from "@/lib/formulation/worksheet";
import { DOC_PART2_NOTICE, docPlainText } from "@/lib/tools/doc-model";
import { docDocx, docPdf, docPdfPageLines } from "@/lib/tools/doc-export";
import { PDF_DISCLAIMER } from "@/lib/pdf";

const PLANNED_IDS = [
  "five-ps-biopsychosocial-spiritual",
  "cbt-three-level",
  "disorder-maintenance-models",
  "functional-analysis",
  "psychodynamic-ccrt",
  "act-flexibility",
  "transdiagnostic-process-map",
  "phase-based-trauma-sequencing",
  "minority-stress",
  "moral-injury",
  "fear-avoidance-pain",
  "co-occurring-and-level-of-care",
  "dimensional-personality",
];

/** The formulation targets treatment-plan objectives use (plan bucket contract). */
const TARGETS = [
  "avoidance-escape",
  "safety-behaviors",
  "repetitive-negative-thinking",
  "intolerance-of-uncertainty",
  "threat-monitoring",
  "reassurance-seeking-checking",
  "emotion-dysregulation",
  "experiential-avoidance",
  "cognitive-fusion",
  "self-criticism-shame",
  "negative-core-beliefs",
  "perfectionism",
  "low-reward-engagement",
  "sleep-rhythm-disruption",
  "interpersonal-difficulties",
  "urges-and-impulsivity",
  "trauma-memory-intrusions",
  "physical-health-burden",
  "low-social-support",
  "structural-stressors",
  "strengths-and-supports",
  "values-and-meaning",
  "coping-skills",
  "hope-and-motivation",
];

/** Every string in an item, so wording checks run field by field. */
function strings(v: unknown): string[] {
  if (typeof v === "string") return [v];
  if (Array.isArray(v)) return v.flatMap(strings);
  if (v && typeof v === "object") return Object.values(v).flatMap(strings);
  return [];
}

/** Refs that know every id the frameworks use, so a test isolates one structural rule. */
function permissiveRefs(list: readonly Formulation[]): FormulationRefs {
  const all = new Set(
    list.flatMap((f) => [
      ...f.interventionIds,
      ...f.handoutIds,
      ...f.conditionIds,
      ...f.legalIds,
      ...f.structure.flatMap((s) => [...(s.interventionIds ?? []), ...(s.conditionIds ?? [])]),
      ...(f.factors ?? []).flatMap((x) => x.interventionIds),
      ...(f.functions ?? []).flatMap((x) => x.interventionIds),
    ]),
  );
  const licenses = Object.fromEntries(list.flatMap((f) => f.measuresPending.map((m) => [m.licenseKey, { status: "pending" }])));
  return { interventions: all, handouts: all, conditions: all, legal: all, sudHandouts: new Set(), sudConditions: new Set(), licenses };
}

describe("formulation content", () => {
  it("loads exactly the planned frameworks, each valid against the schema", () => {
    expect(formulations.map((f) => f.id).sort()).toEqual([...PLANNED_IDS].sort());
    for (const f of formulations) expect(FormulationSchema.safeParse(f).success).toBe(true);
  });

  it("the process map defines exactly the formulation targets, and only it defines factors", () => {
    expect([...FORMULATION_TARGET_IDS]).toEqual(TARGETS);
    expect(formulations.filter((f) => f.factors).map((f) => f.id)).toEqual(["transdiagnostic-process-map"]);
    expect(formulationFactors.filter((f) => f.kind === "strength").map((f) => f.id)).toEqual([
      "strengths-and-supports",
      "values-and-meaning",
      "coping-skills",
      "hope-and-motivation",
    ]);
    expect(behaviorFunctions.map((f) => f.id)).toEqual(["escape-avoidance", "access-to-reward", "social", "automatic"]);
  });

  it("carries governance: sources, original license, verification date and pending review", () => {
    for (const f of formulations) {
      expect(f.sources.length, f.id).toBeGreaterThan(0);
      for (const s of f.sources) expect(s.url, f.id).toMatch(/^https:\/\//);
      expect(f.license).toBe("original");
      expect(f.lastVerified).toBe("2026-11-27");
      expect(f.reviewedBy).toBe("PENDING");
    }
  });

  it("uses original wording: no quotes, no criteria structure, no verdicts, no homeopathy", () => {
    for (const f of formulations)
      for (const s of strings(f)) {
        expect(s, f.id).not.toMatch(/["“”]/);
        expect(s, f.id).not.toMatch(/\bcriterion\b|meets (the )?criteria|the diagnosis is|\bdiagnosed\b|homeopath/i);
      }
  });

  it("plain labels printed on shareable copies never name a diagnosis or a code", () => {
    const names = conditions.map((c) => c.name.toLowerCase());
    for (const chip of [...formulationFactors, ...behaviorFunctions]) {
      expect(chip.plainLabel).not.toMatch(/disorder|PTSD|ICD|DSM|[A-Z]\d{2}\.\d/);
      for (const n of names) expect(chip.plainLabel.toLowerCase()).not.toContain(n);
    }
  });

  it("trained-only models say so and link out; codes always come with the DSM-5-TR pointer", () => {
    for (const id of ["psychodynamic-ccrt", "phase-based-trauma-sequencing", "moral-injury"]) {
      const f = getFormulation(id)!;
      expect(f.trainingRequired, id).toMatch(/trained clinicians only/i);
      expect(f.trainingPath?.length, id).toBeGreaterThan(0);
    }
    for (const f of formulations.filter((x) => x.codes?.length)) expect(f.dsmPointer).toContain("See DSM-5-TR");
    expect(getFormulation("dimensional-personality")!.codes!.map((c) => c.code)).toContain("6D11.5");
  });

  it("only the co-occurring framework is a Part 2 framework, and it states the exact notice", () => {
    expect(formulations.filter((f) => f.sud).map((f) => f.id)).toEqual(["co-occurring-and-level-of-care"]);
    expect(getFormulation("co-occurring-and-level-of-care")!.cautions.join(" ")).toContain(DOC_PART2_NOTICE);
  });

  it("measures other than PHQ-9 and GAD-7 are link-outs only", () => {
    const keys = formulations.flatMap((f) => f.measuresPending.map((m) => m.licenseKey));
    expect(keys.sort()).toEqual(["ASAM Criteria", "LOCUS", "PEG"]);
  });

  it("worksheet frameworks offer chips that exist, and the 5 Ps grid groups them by domain", () => {
    expect(worksheetFormulations.map((f) => f.id).sort()).toEqual(
      ["act-flexibility", "cbt-three-level", "five-ps-biopsychosocial-spiritual", "functional-analysis", "psychodynamic-ccrt"].sort(),
    );
    const targets = new Set(FORMULATION_TARGET_IDS);
    for (const f of worksheetFormulations) for (const p of f.structure) for (const id of p.factorIds ?? []) expect(targets.has(id), `${f.id}/${p.id}`).toBe(true);
    const grid = getFormulation("five-ps-biopsychosocial-spiritual")!.structure;
    expect(grid.filter((p) => p.groupByDomain).map((p) => p.id)).toEqual(["predisposing", "precipitating", "perpetuating", "protective"]);
    expect(grid.find((p) => p.id === "protective")!.factorIds).toEqual(["strengths-and-supports", "values-and-meaning", "coping-skills", "hope-and-motivation"]);
  });

  it("groups the index by family in a fixed order, never by evidence", () => {
    const groups = formulationsByFamily();
    expect(groups.flatMap((g) => g.items).length).toBe(formulations.length);
    expect(groups[0]!.family).toBe("integrative");
  });
});

describe("formulationProblems", () => {
  const today = "2026-11-27";

  it("passes when every referenced id is known", () => {
    expect(formulationProblems(formulations, permissiveRefs(formulations), today)).toEqual([]);
  });

  it("flags unknown factors, factors defined outside the map, and future dates", () => {
    const list = formulations.map((f) =>
      f.id === "act-flexibility" ? { ...f, factorIds: [...(f.factorIds ?? []), "not-a-factor"], factors: [], lastVerified: "2099-01-01" } : f,
    );
    const p = formulationProblems(list, permissiveRefs(list), today);
    expect(p).toContain("formulations/act-flexibility: unknown factor not-a-factor");
    expect(p.some((x) => x.includes("only transdiagnostic-process-map defines factors"))).toBe(true);
    expect(p.some((x) => x.includes("lastVerified in the future"))).toBe(true);
  });

  it("G6: linking a substance-use handout or condition requires the Part 2 flag", () => {
    const refs = { ...permissiveRefs(formulations), sudHandouts: new Set(["what-keeps-it-going"]) };
    expect(formulationProblems(formulations, refs, today)).toContain(
      "formulations/five-ps-biopsychosocial-spiritual: links substance-use content but sud is false (G6)",
    );
  });

  it("G7: a pending measure must have a licenses.json entry that is not confirmed", () => {
    const base = permissiveRefs(formulations);
    const p = formulationProblems(formulations, { ...base, licenses: { ...base.licenses, PEG: { status: "confirmed" } } }, today);
    expect(p.some((x) => x.includes("PEG three-item pain scale is confirmed"))).toBe(true);
    const missing = formulationProblems(formulations, { ...base, licenses: {} }, today);
    expect(missing.filter((x) => x.includes("(G7)")).length).toBe(3);
  });

  it("checks folders owned by other sections only when they are passed", () => {
    const refs = { ...permissiveRefs(formulations), populations: new Set<string>() };
    expect(formulationProblems(formulations, refs, today).some((x) => x.includes("unknown population lgbtq-affirmative"))).toBe(true);
  });
});

describe("worksheet model", () => {
  const names = Object.fromEntries(interventions.map((i) => [i.id, i.name]));
  const lib = worksheetLibrary(formulationFactors, behaviorFunctions, names);
  const grid = toWorksheetTemplate(getFormulation("five-ps-biopsychosocial-spiritual")!);
  const fa = toWorksheetTemplate(getFormulation("functional-analysis")!);
  const gad = { shortName: "GAD-7", total: 14, max: 21, answered: 7, items: 7, band: "Moderate anxiety", riskMessages: [] };
  const prefill = sessionPrefill(
    { symptoms: [{ id: "worry-excessive", label: "Excessive worry" }, { id: "alcohol-craving", label: "Craving" }], cultural: [], measures: [gad] },
    new Set(["alcohol-craving"]),
  );

  it("prefills curated session wording only, read-only, with substance-use items marked", () => {
    expect(prefill.map((i) => i.text)).toEqual(["Excessive worry", "Craving", "GAD-7 total 14 of 21 (Moderate anxiety range)."]);
    expect(prefill.filter((i) => i.sud).map((i) => i.id)).toEqual(["symptom:alcohol-craving"]);
  });

  it("links tapped chips to library interventions, most links first, with what they are linked to", () => {
    let d: WorksheetDraft = toggleChip(EMPTY_DRAFT, "perpetuating", "avoidance-escape");
    d = toggleChip(d, "perpetuating", "safety-behaviors");
    const s = suggestInterventions(grid, d, lib);
    expect(s.length).toBeGreaterThan(0);
    for (const x of s) expect(x.id in names).toBe(true);
    for (let i = 1; i < s.length; i++) expect(s[i - 1]!.linked.length).toBeGreaterThanOrEqual(s[i]!.linked.length);
    const exposure = s.find((x) => x.id === "graded-in-vivo-exposure")!;
    expect(exposure.linked.map((c) => c.id)).toEqual(["avoidance-escape"]);
    expect(exposure.alsoTargets.map((c) => c.id)).toContain("escape-avoidance");
    expect(hasWork(d)).toBe(true);
    expect(hasWork(toggleChip(d, "perpetuating", "avoidance-escape"))).toBe(true);
    expect(hasWork(EMPTY_DRAFT)).toBe(false);
  });

  it("exports plain wording grouped by domain, one blank Client line, scrubbed notes and the crisis box", () => {
    let d = toggleChip(EMPTY_DRAFT, "perpetuating", "avoidance-escape");
    d = toggleChip(d, "perpetuating", "sleep-rhythm-disruption");
    d = toggleChip(d, "protective", "values-and-meaning");
    d = setPartText(d, "summary", "Worry grew after a move. Call Maria Lopez at 555-301-2299.");
    const text = docPlainText(worksheetDoc(grid, d, lib, prefill));
    expect(text.match(/^Client: _+$/gm)?.length).toBe(1);
    expect(text).toContain("Psychological: Staying away from, or leaving, hard situations, places or feelings");
    expect(text).toContain("Biological: Irregular sleep or an unsettled daily routine");
    expect(text).toContain("Cultural and spiritual: What matters most to me");
    expect(text).toContain("GAD-7 total 14 of 21");
    expect(text).not.toMatch(/301-2299|Maria Lopez/);
    expect(text).toContain("Need help now?");
    expect(text).toContain("Resource only. Not a substitute for clinical judgment.");
    expect(text).toMatch(/Possible interventions to discuss \(for clinician review\)/);
    for (const c of conditions) expect(text).not.toContain(c.name);
    expect(text).not.toMatch(/\b[A-Z]\d{2}\.\d|6[A-E]\d{2}/);
  });

  it("prints ruled lines for empty parts and function chips by their plain words", () => {
    const d = toggleChip(EMPTY_DRAFT, "function", "escape-avoidance");
    const spec = worksheetDoc(fa, d, lib, []);
    expect(spec.blocks.filter((b) => b.kind === "write").length).toBe(fa.parts.length - 1);
    expect(docPlainText(spec)).toContain("Getting away from something unpleasant");
  });

  it("G6: ticked, typed or prefilled substance use adds the Part 2 notice; leaving the item out removes it", () => {
    expect(worksheetRecordsSubstanceUse(grid, EMPTY_DRAFT, prefill)).toBe(true);
    const without = togglePrefill(EMPTY_DRAFT, "presenting", "symptom:alcohol-craving");
    expect(worksheetRecordsSubstanceUse(grid, without, prefill)).toBe(false);
    expect(worksheetRecordsSubstanceUse(grid, { ...without, substanceUse: true }, prefill)).toBe(true);
    expect(worksheetRecordsSubstanceUse(grid, setPartText(without, "summary", "drinks most nights"), prefill)).toBe(true);
    const spec = worksheetDoc(grid, { ...without, substanceUse: true }, lib, prefill);
    expect(spec.part2).toBe(true);
    expect(docPlainText(spec)).toContain(DOC_PART2_NOTICE);
    expect(worksheetDoc(grid, without, lib, prefill).part2).toBe(false);
  });

  it("renders to PDF and Word on this device with the disclaimer on every page and Part 2 when needed", async () => {
    let d = toggleChip(EMPTY_DRAFT, "perpetuating", "avoidance-escape");
    d = { ...setPartText(d, "summary", "A short shared explanation."), substanceUse: true };
    const spec = worksheetDoc(grid, d, lib, prefill);
    const pages = docPdfPageLines(spec);
    pages.forEach((lines, i) => {
      expect(lines).toContain(PDF_DISCLAIMER);
      expect(lines).toContain(`Page ${i + 1} of ${pages.length}`);
      expect(lines.join(" ")).toContain("42 CFR Part 2");
    });
    expect(pages.flat().filter((l) => /^Client: _+$/.test(l)).length).toBe(1);
    const bytes = await docPdf(spec);
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(pages.length);
    const body = strFromU8(unzipSync(await docDocx(spec))["word/document.xml"]!);
    expect(body).toContain("Formulation worksheet (5 Ps grid)");
    expect(body).toContain(DOC_PART2_NOTICE);
  });
});
