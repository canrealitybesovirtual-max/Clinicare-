import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { strFromU8, unzipSync } from "fflate";
import { getPlanLibrary } from "@/lib/library";
import { measures } from "@/lib/content";
import {
  DOCX_MIME,
  PLAN_FOOTER,
  PLAN_NAME_LINE,
  PLAN_PART2_NOTICE,
  PLAN_TITLE,
  planDocx,
  planOutline,
  planOutlineText,
  planPdf,
  planPdfPageLines,
  type PlanExport,
} from "@/lib/plan-export";
import {
  addCustomItem,
  createDraft,
  setItemText,
  setMeasure,
  toPlanExport,
  toggleIntervention,
  toggleItem,
  toggleProblem,
  type MeasureOption,
  type PlanDraft,
  type PlanLibraryOption,
} from "@/components/plan/plan-model";

const MEASURES: MeasureOption[] = measures.map((m) => ({ id: m.id, shortName: m.shortName, name: m.name }));
const INTERVENTION_NAMES = new Map([
  ["progressive-muscle-relaxation", { name: "Progressive muscle relaxation (PMR)" }],
  ["motivational-interviewing", { name: "Motivational interviewing (MI)" }],
  ["worry-time", { name: "Worry time (stimulus control for worry)" }],
]);

/** Identifier LABELS that must never appear on an export (a blank "Name:" line is the only personal field). */
const IDENTIFIER_LABELS =
  /\b(?:DOB|date of birth|birth ?date|address|phone|telephone|fax|e-?mail|MRN|medical record(?: number)?|record number|SSN|social security(?: number)?|insurance(?: id)?|member id|policy number|zip(?: code)?|client id|patient id|date)\s*:/i;

function option(conditionId: string, label: string, sud: boolean, codes: Pick<PlanLibraryOption, "icd10cm" | "icd11"> = { icd10cm: [], icd11: [] }): PlanLibraryOption {
  const library = getPlanLibrary(conditionId);
  if (!library) throw new Error(`missing plan library ${conditionId}`);
  return { conditionId, label, sud, library, ...codes };
}

/** Select everything in every problem, link one intervention per objective, include every measure. */
function fullDraft(opt: PlanLibraryOption): PlanDraft {
  let d = createDraft(opt, MEASURES);
  for (const p of d.problems) {
    d = toggleProblem(d, p.id, true);
    for (const i of p.definitions) d = toggleItem(d, p.id, "definitions", i.id, true);
    for (const i of p.goals) d = toggleItem(d, p.id, "goals", i.id, true);
    for (const o of p.objectives) {
      d = toggleItem(d, p.id, "objectives", o.id, true);
      const first = o.suggestedInterventionIds.find((x) => INTERVENTION_NAMES.has(x)) ?? "motivational-interviewing";
      d = toggleIntervention(d, p.id, o.id, first, true);
    }
  }
  for (const m of MEASURES) d = setMeasure(d, m.id, { included: true });
  return d;
}

const gadOption = option("generalized-anxiety-disorder", "Generalized anxiety disorder", false, { icd10cm: ["F41.1"], icd11: ["6B00"] });
const audOption = option("alcohol-use-disorder", "Alcohol use disorder", true);

function exportOf(opt: PlanLibraryOption, d = fullDraft(opt)): PlanExport {
  return toPlanExport(d, { option: opt, interventions: INTERVENTION_NAMES, measures: MEASURES });
}

function docxParts(bytes: Uint8Array): { document: string; footers: string; core: string } {
  const files = unzipSync(bytes);
  const text = (name: string) => (files[name] ? strFromU8(files[name]!) : "");
  const footers = Object.keys(files)
    .filter((n) => /^word\/footer\d*\.xml$/.test(n))
    .map(text)
    .join("\n");
  return { document: text("word/document.xml"), footers, core: text("docProps/core.xml") };
}

/** Visible text runs of a WordprocessingML part, entity-decoded. */
function xmlText(xml: string): string {
  return [...xml.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)]
    .map((m) => m[1]!)
    .join(" ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

describe("plan model -> export model", () => {
  it("exports only what the clinician selected (G3: nothing is preselected)", () => {
    const empty = toPlanExport(createDraft(gadOption, MEASURES), { option: gadOption, interventions: INTERVENTION_NAMES, measures: MEASURES });
    expect(empty.problems).toEqual([]);
    expect(empty.measures).toEqual([]);

    const full = exportOf(gadOption);
    const lib = gadOption.library;
    expect(full.problems).toHaveLength(lib.problems.length);
    expect(full.problems[0]!.definitions).toEqual(lib.problems[0]!.definitions);
    expect(full.problems[0]!.objectives[0]!.interventions.length).toBe(1);
    expect(full.measures.map((m) => m.shortName).sort()).toEqual(["GAD-7", "PHQ-9"]);
  });

  it("scrubs custom wording again at export so planted identifiers never reach a file", () => {
    let d = fullDraft(gadOption);
    const pid = d.problems[0]!.id;
    const added = addCustomItem(d, pid, "objectives");
    d = setItemText(added.draft, pid, "objectives", added.id, "Practice with Maria Lopez, call 555-867-5309 or maria.lopez@example.com");
    const plan = exportOf(gadOption, d);
    const all = planOutlineText(plan).join("\n");
    expect(all).not.toMatch(/555-867-5309|maria\.lopez@example\.com|Maria Lopez/);
    expect(all).toContain("[PHONE]");
  });
});

describe("plan outline", () => {
  it("has the title, one blank name line, the clinician-review label and a DSM-5-TR pointer", () => {
    const text = planOutlineText(exportOf(gadOption));
    expect(text[0]).toBe(PLAN_TITLE);
    expect(text.filter((t) => /^Name:/.test(t))).toEqual([PLAN_NAME_LINE]);
    expect(text.join(" ")).toMatch(/For clinician review/);
    expect(text.join(" ")).toMatch(/See DSM-5-TR/);
    expect(text.join(" ")).toMatch(/ICD-10-CM F41\.1; ICD-11 6B00/);
  });

  it("never states a final diagnosis and has no identifier labels", () => {
    for (const opt of [gadOption, audOption]) {
      const text = planOutlineText(exportOf(opt)).join("\n");
      expect(text).not.toMatch(/\bdiagnosis\s*:/i);
      expect(text).not.toMatch(/\bdiagnosed with\b/i);
      expect(text).not.toMatch(IDENTIFIER_LABELS);
    }
  });

  it("carries the Part 2 notice only for substance-use plans", () => {
    expect(planOutlineText(exportOf(audOption))).toContain(PLAN_PART2_NOTICE);
    expect(planOutlineText(exportOf(gadOption))).not.toContain(PLAN_PART2_NOTICE);
    expect(PLAN_PART2_NOTICE).toBe("42 CFR Part 2 prohibits unauthorized use or disclosure of these records.");
  });

  it("carries the Part 2 notice when a selected item in a non-SUD library records substance use (G6)", () => {
    const sadOption = option("social-anxiety-disorder", "Social anxiety disorder", false);
    // Nothing selected: no notice.
    expect(exportOf(sadOption, createDraft(sadOption, MEASURES)).sud).toBe(false);
    // Select only the tagged alcohol objective (and its problem).
    let d = createDraft(sadOption, MEASURES);
    const prob = d.problems.find((p) => p.objectives.some((o) => o.sud))!;
    const tagged = prob.objectives.find((o) => o.sud)!;
    d = toggleProblem(d, prob.id, true);
    d = toggleItem(d, prob.id, "objectives", tagged.id, true);
    const plan = exportOf(sadOption, d);
    expect(plan.sud).toBe(true);
    expect(planOutlineText(plan)).toContain(PLAN_PART2_NOTICE);
    // The same problem without the tagged objective: no notice.
    const untagged = prob.objectives.find((o) => !o.sud && !/alcohol|drink|substance/i.test(o.text))!;
    let d2 = toggleProblem(createDraft(sadOption, MEASURES), prob.id, true);
    d2 = toggleItem(d2, prob.id, "objectives", untagged.id, true);
    expect(exportOf(sadOption, d2).sud).toBe(false);
  });

  it("carries the Part 2 notice when the clinician's own wording mentions substance use", () => {
    let d = createDraft(gadOption, MEASURES);
    const pid = d.problems[0]!.id;
    d = toggleProblem(d, pid, true);
    const added = addCustomItem(d, pid, "objectives");
    d = setItemText(added.draft, pid, "objectives", added.id, "Cut back to no more than 2 drinks on weekend evenings by week 6.");
    const plan = exportOf(gadOption, d);
    expect(plan.sud).toBe(true);
    expect(planOutlineText(plan)).toContain(PLAN_PART2_NOTICE);
  });

  it("tags every non-SUD library item that mentions alcohol or other substances", () => {
    const re = /\b(?:alcohol|drink(?:s|ing)?|substances?|drugs?)\b/i;
    for (const id of ["adjustment-disorder", "insomnia-disorder", "prolonged-grief-disorder", "social-anxiety-disorder"]) {
      const lib = getPlanLibrary(id)!;
      expect(lib.sud, id).toBe(false);
      for (const p of lib.problems) {
        for (const t of [...p.definitions, ...p.longTermGoals]) {
          const text = typeof t === "string" ? t : t.text;
          if (re.test(text)) expect(typeof t === "string" ? false : t.sud, `${id}: ${text.slice(0, 50)}`).toBe(true);
        }
        for (const o of p.shortTermObjectives) if (re.test(o.text)) expect(o.sud, `${id}: ${o.id}`).toBe(true);
      }
    }
  });

  it("adds the PHQ-9 item 9 follow-up note only when PHQ-9 is in the plan", () => {
    const withPhq = planOutlineText(exportOf(gadOption)).join(" ");
    expect(withPhq).toMatch(/item 9/);
    let d = fullDraft(gadOption);
    d = setMeasure(d, "phq-9", { included: false });
    expect(planOutlineText(exportOf(gadOption, d)).join(" ")).not.toMatch(/item 9/);
  });

  it("is never empty: an empty plan still has its structure, review label and footer content", () => {
    const blocks = planOutline(toPlanExport(createDraft(gadOption, MEASURES), { option: gadOption, interventions: INTERVENTION_NAMES, measures: MEASURES }));
    expect(blocks.some((b) => b.kind === "paragraph" && /No problems were selected/.test(b.text))).toBe(true);
  });
});

describe("planPdf", () => {
  it("produces a valid PDF with the disclaimer footer and page numbers on every page", async () => {
    const plan = exportOf(gadOption);
    const bytes = await planPdf(plan);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    const doc = await PDFDocument.load(bytes);
    const pages = planPdfPageLines(plan);
    expect(doc.getPageCount()).toBe(pages.length);
    expect(pages.length).toBeGreaterThan(1); // a full plan spans pages, so the footer check is meaningful
    pages.forEach((lines, i) => {
      expect(lines).toContain(PLAN_FOOTER);
      expect(lines).toContain(`Page ${i + 1} of ${pages.length}`);
      expect(lines).not.toContain(PLAN_PART2_NOTICE);
    });
    expect(PLAN_FOOTER).toBe("Resource only. Not a substitute for clinical judgment.");
    expect(doc.getAuthor()).toBeUndefined();
  });

  it("prints the Part 2 notice in the footer of every page of a substance-use plan", async () => {
    const plan = exportOf(audOption);
    const bytes = await planPdf(plan);
    expect(bytes.length).toBeGreaterThan(1000);
    const pages = planPdfPageLines(plan);
    pages.forEach((lines) => {
      expect(lines.join(" ")).toContain(PLAN_PART2_NOTICE);
      expect(lines).toContain(PLAN_FOOTER);
    });
  });

  it("has no identifier labels; the only personal field is the blank name line", () => {
    for (const opt of [gadOption, audOption]) {
      const all = planPdfPageLines(exportOf(opt)).flat();
      expect(all.join("\n")).not.toMatch(IDENTIFIER_LABELS);
      expect(all.filter((l) => /^Name:/.test(l))).toEqual([PLAN_NAME_LINE]);
    }
  });
});

describe("planDocx", () => {
  it("produces a .docx (zip) with the plan text and the disclaimer in the page footer", async () => {
    const bytes = await planDocx(exportOf(gadOption));
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(String.fromCharCode(bytes[0]!, bytes[1]!)).toBe("PK");
    const { document, footers } = docxParts(bytes);
    const body = xmlText(document);
    expect(body).toContain(PLAN_TITLE);
    expect(body).toContain(PLAN_NAME_LINE);
    expect(body).toContain(gadOption.library.problems[0]!.label);
    expect(xmlText(footers)).toContain(PLAN_FOOTER);
    expect(xmlText(footers)).not.toContain(PLAN_PART2_NOTICE);
    expect(body).not.toContain(PLAN_PART2_NOTICE);
    expect(DOCX_MIME).toMatch(/wordprocessingml/);
  });

  it("is accessible: document language, a Heading 1 title (no Title style) and real numbered lists", async () => {
    const files = unzipSync(await planDocx(exportOf(gadOption)));
    const styles = strFromU8(files["word/styles.xml"]!);
    const document = strFromU8(files["word/document.xml"]!);
    expect(styles).toMatch(/<w:lang [^>]*w:val="en-US"/);
    expect(document).not.toMatch(/<w:pStyle w:val="Title"\/>/);
    expect(document).toMatch(/<w:pStyle w:val="Heading1"\/>/);
    expect(files["word/numbering.xml"]).toBeDefined();
    expect(document).toMatch(/<w:numPr>/);
    // No typed "1." numbering left in the text.
    expect(xmlText(document)).not.toMatch(/(?:^| )1\.\t/);
  });

  it("carries the Part 2 notice in the body and the footer of a substance-use plan", async () => {
    const { document, footers } = docxParts(await planDocx(exportOf(audOption)));
    expect(xmlText(document)).toContain(PLAN_PART2_NOTICE);
    expect(xmlText(footers)).toContain(PLAN_PART2_NOTICE);
    expect(xmlText(footers)).toContain(PLAN_FOOTER);
  });

  it("has no identifier labels or author metadata", async () => {
    for (const opt of [gadOption, audOption]) {
      const { document, footers, core } = docxParts(await planDocx(exportOf(opt)));
      const text = `${xmlText(document)}\n${xmlText(footers)}`;
      expect(text).not.toMatch(IDENTIFIER_LABELS);
      expect(text.match(/Name:/g)).toHaveLength(1);
      expect(core).not.toMatch(/Un-named/);
      // No created or modified date (G5): a filled-in name line plus a timestamp would be a dated record.
      expect(core).toContain("<dc:title>");
      expect(core).not.toMatch(/dcterms:(created|modified)|\d{4}-\d{2}-\d{2}T/);
    }
  });
});
