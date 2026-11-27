/**
 * Safety-plan worksheet and its client PDF: typed parts are scrubbed, names and numbers print as blank lines, the
 * crisis lines are always there, the wording is the app's own, and substance mentions add the Part 2 notice.
 */
import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { PDF_DISCLAIMER } from "@/lib/pdf";
import { DOC_PART2_NOTICE, docPlainText } from "@/lib/tools/doc-model";
import { docPdf, docPdfLayout, docPdfPageLines } from "@/lib/tools/doc-export";
import {
  SAFETY_PLAN_SECTIONS,
  SAFETY_PLAN_SOURCES,
  safetyPlanDoc,
  sectionItems,
  type SafetyPlanEntries,
} from "@/lib/tools/safety-plan";

const typed: SafetyPlanEntries = {
  "warning-signs": "Not sleeping\nPulling away from people",
  "coping-alone": "- Walk around the block\n• Cold water on my face",
  distraction: "A coffee shop\nThe library",
  "safer-space": "Ask my sister to hold my medicines",
  reasons: "My dog\nSeeing my nephew grow up",
};

const textOf = (entries: SafetyPlanEntries) => docPlainText(safetyPlanDoc(entries));

describe("typed parts", () => {
  it("lists typed ideas one per line, without list markers", () => {
    expect(sectionItems("- one\n\n• two\n  three  ")).toEqual(["one", "two", "three"]);
    const text = textOf(typed);
    expect(text).toContain("- Walk around the block");
    expect(text).toContain("- Cold water on my face");
  });

  it("scrubs names, phone numbers, emails and addresses typed into any part", () => {
    const text = textOf({
      "warning-signs": "Call John Smith at 555-201-3344",
      distraction: "Go to 1420 Maple Avenue",
      reasons: "Write to jane.doe@example.com",
    });
    expect(text).not.toMatch(/John Smith|201-3344|1420 Maple|jane\.doe@example\.com/);
    expect(text).toContain("[PHONE]");
    expect(text).toContain("[EMAIL]");
  });

  it("offers no typed field for people or professionals", () => {
    const untyped = SAFETY_PLAN_SECTIONS.filter((s) => !s.typed).map((s) => s.id);
    expect(untyped).toEqual(["reach-out", "professional-help"]);
  });
});

describe("blank lines and crisis lines", () => {
  it("prints blank handwritten lines for names and numbers, typed or not", () => {
    for (const entries of [{}, typed]) {
      const text = textOf(entries);
      expect(text.match(/^Name: _+$/gm)?.length).toBe(1);
      expect(text.match(/^Name and phone \(write by hand\): _+$/gm)?.length).toBe(3);
      expect(text.match(/^My clinician or clinic, and phone \(write by hand\): _+$/gm)?.length).toBe(2);
      expect(text.match(/^Person \(write by hand\): _+$/gm)?.length).toBe(2);
    }
  });

  it("prints ruled lines where nothing was typed", () => {
    const blank = safetyPlanDoc({});
    const ruled = blank.blocks.filter((b) => b.kind === "write").reduce((n, b) => n + (b.kind === "write" ? b.lines : 0), 0);
    expect(ruled).toBe(SAFETY_PLAN_SECTIONS.reduce((n, s) => n + (s.typed ? s.blankLines : 0), 0));
    const lineOps = docPdfLayout(blank).pages.flatMap((p) => p.ops.filter((o) => o.kind === "line"));
    // One rule per handwriting line, plus the footer separator on each page.
    expect(lineOps.length).toBe(ruled + docPdfLayout(blank).pages.length);
    expect(safetyPlanDoc(typed).blocks.some((b) => b.kind === "write")).toBe(false);
  });

  it("always prints 988, the emergency number and findahelpline.com", () => {
    for (const entries of [{}, typed]) {
      const text = textOf(entries);
      expect(text).toContain("call or text 988");
      expect(text).toContain("911");
      expect(text).toContain("findahelpline.com");
      expect(text).toContain("Need help now?");
    }
  });
});

describe("wording and governance", () => {
  it("does not reuse the Stanley-Brown step titles", () => {
    const headings = SAFETY_PLAN_SECTIONS.map((s) => `${s.heading} ${s.prompt}`).join("\n");
    expect(headings).not.toMatch(
      /warning signs|internal coping|social settings that provide distraction|people whom i can ask for help|professionals or agencies|making the environment safe/i,
    );
    expect(textOf({})).toContain("It is not the Stanley-Brown Safety Plan");
  });

  it("never scores or grades risk", () => {
    expect(textOf(typed)).not.toMatch(/\brisk (level|score)\b|\b(low|moderate|high) risk\b|\bscore\b/i);
  });

  it("cites sources", () => {
    expect(SAFETY_PLAN_SOURCES.length).toBeGreaterThan(0);
    for (const s of SAFETY_PLAN_SOURCES) expect(s.url).toMatch(/^https:\/\//);
  });
});

describe("PDF", () => {
  it("has the disclaimer and page number on every page and loads as a PDF", async () => {
    const spec = safetyPlanDoc(typed);
    const pages = docPdfPageLines(spec);
    pages.forEach((lines, i) => {
      expect(lines).toContain(PDF_DISCLAIMER);
      expect(lines).toContain(`Page ${i + 1} of ${pages.length}`);
    });
    const bytes = await docPdf(spec);
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(pages.length);
  });

  it("adds the Part 2 notice at the top and in every footer when substances are mentioned", () => {
    expect(safetyPlanDoc(typed).part2).toBe(false);
    const spec = safetyPlanDoc({ ...typed, "safer-space": "Keep alcohol out of the house" });
    expect(spec.part2).toBe(true);
    const pages = docPdfPageLines(spec);
    expect(pages[0]!.join(" ")).toContain(DOC_PART2_NOTICE);
    for (const lines of pages) expect(lines.join(" ")).toContain("42 CFR Part 2");
  });
});
