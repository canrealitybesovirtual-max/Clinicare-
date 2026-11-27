/**
 * Session note helper: prefill from the session, no diagnosis, one blank "Client" line, scrubbing, Part 2, and the
 * PDF / Word / plain-text exports with the disclaimer footer.
 */
import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { strFromU8, unzipSync } from "fflate";
import { conditions, getSymptom, measures } from "@/lib/content";
import { getPlanLibrary, interventions } from "@/lib/library";
import { PDF_CRISIS_HEADING, PDF_CRISIS_LINE, PDF_DISCLAIMER, PDF_PART2_NOTICE } from "@/lib/pdf";
import { noteContext, planSelections, sessionMeasures } from "@/lib/notes/context";
import {
  IMPRESSIONS_LINE,
  NOTE_FORMATS,
  NOTE_REVIEW_LINE,
  measureLine,
  noteDoc,
  noteRecordsSubstanceUse,
  prefillNote,
  type NoteContext,
  type NoteFormat,
} from "@/lib/notes/note";
import { DOC_CRISIS_HEADING, DOC_CRISIS_LINE, DOC_FOOTER, DOC_PART2_NOTICE, docPlainText } from "@/lib/tools/doc-model";
import { docDocx, docPdf, docPdfPageLines } from "@/lib/tools/doc-export";
import { createDraft, toggleIntervention, toggleItem, toggleProblem } from "@/components/plan/plan-model";

const sym = (id: string) => {
  const s = getSymptom(id);
  if (!s) throw new Error(`missing symptom ${id}`);
  return s;
};

const FORMATS: NoteFormat[] = ["soap", "dap", "birp", "girp"];

function planWithObjective() {
  const library = getPlanLibrary("generalized-anxiety-disorder")!;
  let d = createDraft({ conditionId: library.conditionId, library }, measures);
  const p = d.problems[0]!;
  const o = p.objectives[0]!;
  const interventionId = o.suggestedInterventionIds[0] ?? interventions[0]!.id;
  d = toggleProblem(d, p.id, true);
  d = toggleItem(d, p.id, "objectives", o.id, true);
  d = toggleIntervention(d, p.id, o.id, interventionId, true);
  return { draft: d, objective: o.text, interventionId };
}

const names = Object.fromEntries(interventions.map((i) => [i.id, i.name]));

function richContext(): NoteContext {
  const { draft } = planWithObjective();
  return noteContext(
    {
      symptoms: [sym("worry-excessive"), sym("insomnia"), sym("passive-death-wish")],
      cultural: [],
      redFlags: [sym("passive-death-wish")],
      // PHQ-9 complete with item 9 answered 1; GAD-7 half answered.
      measureAnswers: { "phq-9": [2, 2, 1, 1, 1, 1, 2, 1, 1], "gad-7": [1, 2, 1, null, null, null, null] },
      plan: draft,
    },
    measures,
    names,
  );
}

describe("session context", () => {
  it("scores measures with the app's scorer, with bands only when complete", () => {
    const list = sessionMeasures(measures, { "phq-9": [2, 2, 1, 1, 1, 1, 2, 1, 1], "gad-7": [1, 2, 1, null, null, null, null] });
    const phq = list.find((m) => m.shortName === "PHQ-9")!;
    const gad = list.find((m) => m.shortName === "GAD-7")!;
    expect(phq).toMatchObject({ total: 12, max: 27, answered: 9, band: "Moderate" });
    expect(phq.riskMessages.length).toBe(1);
    expect(gad).toMatchObject({ total: 4, answered: 3, band: null });
    expect(measureLine(phq)).toBe("PHQ-9 total 12 of 27 (Moderate range).");
    expect(measureLine(gad)).toBe("GAD-7: 3 of 7 items answered, total not final.");
    expect(sessionMeasures(measures, { "phq-9": Array(9).fill(null) })).toEqual([]);
  });

  it("reads selected plan objectives and their chosen interventions by name", () => {
    const { draft, objective, interventionId } = planWithObjective();
    const sel = planSelections(draft, names);
    expect(sel.objectives).toEqual([objective.replace(/\s+/g, " ").trim()]);
    expect(sel.interventions).toEqual([names[interventionId]]);
    expect(planSelections(null, names)).toEqual({ objectives: [], interventions: [] });
  });
});

describe("prefill", () => {
  it("defines four formats with their sections", () => {
    expect(NOTE_FORMATS.map((f) => f.id)).toEqual(FORMATS);
    expect(NOTE_FORMATS.find((f) => f.id === "soap")!.sections.map((s) => s.heading)).toEqual(["Subjective", "Objective", "Assessment", "Plan"]);
    expect(NOTE_FORMATS.find((f) => f.id === "girp")!.sections.map((s) => s.heading)).toEqual(["Goals", "Intervention", "Response", "Plan"]);
  });

  it.each(FORMATS)("%s: presenting concerns, measures, interventions, objectives and clinician-to-complete impressions", (format) => {
    const ctx = richContext();
    const text = prefillNote(format, ctx).map((s) => s.text).join("\n");
    expect(text).toContain("Presenting concerns documented this session:");
    expect(text).toContain(sym("worry-excessive").label);
    expect(text).toContain("PHQ-9 total 12 of 27 (Moderate range).");
    expect(text).toContain(IMPRESSIONS_LINE);
    expect(text).toContain(ctx.interventions[0]!);
    expect(text).toContain(ctx.objectives[0]!);
    // Safety items are prompts to document an assessment; nothing grades risk.
    expect(text).toContain("Record your own assessment");
    expect(text).not.toMatch(/\b(low|moderate|high|imminent)\s+risk\b/i);
  });

  it.each(FORMATS)("%s: never states a diagnosis or condition name", (format) => {
    const text = prefillNote(format, richContext()).map((s) => `${s.heading}\n${s.hint}\n${s.text}`).join("\n");
    for (const c of conditions) expect(text.toLowerCase()).not.toContain(c.name.toLowerCase());
    expect(text).not.toMatch(/\bdiagnos(is|ed|es)\s*:/i);
    expect(text).not.toMatch(/\bF\d{2}\.\d/);
  });

  it("leaves empty slots for the clinician instead of writing statements the record could not back", () => {
    const empty: NoteContext = { concerns: [], cultural: [], redFlags: [], measures: [], interventions: [], objectives: [] };
    const text = prefillNote("soap", empty).map((s) => s.text).join("\n");
    // A paper measure may have been given, so the draft never says "none completed".
    expect(text).toContain("Presenting concerns: (clinician to complete)");
    expect(text).toContain("Measures: (clinician to complete)");
    expect(text).toContain("Safety: (clinician to complete)");
    expect(text).not.toMatch(/\bnone (documented|completed)\b/i);
  });
});

describe("export", () => {
  const sections = () => prefillNote("soap", richContext());

  it("has one blank Client line, the review label, Session # and no identifier fields", () => {
    const text = docPlainText(noteDoc("soap", sections(), { sessionNumber: 4, sud: false }));
    expect(text.match(/^Client: _+$/gm)?.length).toBe(1);
    expect(text).toContain(NOTE_REVIEW_LINE);
    expect(text).toContain("Session #: 4 · Format: SOAP");
    expect(text).not.toMatch(/date of birth|DOB|MRN|address|phone/i);
    expect(docPlainText(noteDoc("soap", sections(), { sessionNumber: null, sud: false }))).toContain("Session #: ____");
  });

  it("scrubs identifiers typed into a section again at export", () => {
    const edited = sections().map((s, i) =>
      i === 0 ? { ...s, text: "Client Maria Gonzalez called from 555-867-5309, email maria.g@example.com, on 03/14/2026." } : s,
    );
    const text = docPlainText(noteDoc("soap", edited, { sessionNumber: null, sud: false }));
    expect(text).not.toMatch(/Gonzalez|867-5309|maria\.g@example\.com|03\/14\/2026/);
    expect(text).toContain("[PHONE]");
    expect(text).toContain("[EMAIL]");
  });

  it("adds the 42 CFR Part 2 notice only for substance-use content", () => {
    const plain = sections();
    expect(noteRecordsSubstanceUse(plain, false)).toBe(false);
    expect(noteRecordsSubstanceUse(plain, true)).toBe(true);
    const withAlcohol = plain.map((s, i) => (i === 0 ? { ...s, text: `${s.text}\nDrinking more on weekends.` } : s));
    expect(noteRecordsSubstanceUse(withAlcohol, false)).toBe(true);
    expect(docPlainText(noteDoc("soap", plain, { sessionNumber: null, sud: false }))).not.toContain(DOC_PART2_NOTICE);
    expect(docPlainText(noteDoc("soap", plain, { sessionNumber: null, sud: true }))).toContain(DOC_PART2_NOTICE);
  });

  it("keeps the shared export wording identical to the app's PDF wording", () => {
    expect(DOC_FOOTER).toBe(PDF_DISCLAIMER);
    expect(DOC_PART2_NOTICE).toBe(PDF_PART2_NOTICE);
    expect(DOC_CRISIS_HEADING).toBe(PDF_CRISIS_HEADING);
    expect(DOC_CRISIS_LINE).toBe(PDF_CRISIS_LINE);
  });

  it("PDF: the disclaimer and page number on every page; Part 2 in every footer when SUD", async () => {
    const long = sections().map((s) => ({ ...s, text: `${s.text}\n${"Session content line for layout. ".repeat(60)}` }));
    const spec = noteDoc("dap", long, { sessionNumber: 2, sud: true });
    const pages = docPdfPageLines(spec);
    expect(pages.length).toBeGreaterThan(1);
    pages.forEach((lines, i) => {
      expect(lines).toContain(PDF_DISCLAIMER);
      expect(lines).toContain(`Page ${i + 1} of ${pages.length}`);
      expect(lines.join(" ")).toContain("42 CFR Part 2");
    });
    expect(pages.flat().filter((l) => /^Client: _+$/.test(l)).length).toBe(1);
    const bytes = await docPdf(spec);
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(pages.length);
  });

  it("Word: the note text, the footer and the Part 2 notice in body and footer", async () => {
    const files = unzipSync(await docDocx(noteDoc("birp", prefillNote("birp", richContext()), { sessionNumber: 3, sud: true })));
    const body = strFromU8(files["word/document.xml"]!);
    const footers = Object.keys(files)
      .filter((k) => /^word\/footer\d*\.xml$/.test(k))
      .map((k) => strFromU8(files[k]!))
      .join("");
    expect(body).toContain("Session note draft (BIRP)");
    expect(body).toContain("Clinical impressions (clinician to complete):");
    expect(body).toContain(DOC_PART2_NOTICE);
    expect(footers).toContain(PDF_DISCLAIMER);
    expect(footers).toContain(DOC_PART2_NOTICE);
    expect(body.match(/Client: _+/g)?.length).toBe(1);
    // No created or modified date in the file properties (G5).
    const core = strFromU8(files["docProps/core.xml"]!);
    expect(core).toContain("Session note draft (BIRP)");
    expect(core).not.toMatch(/dcterms:(created|modified)|\d{4}-\d{2}-\d{2}T/);
  });
});
