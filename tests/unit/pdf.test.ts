import { afterEach, describe, expect, it, vi } from "vitest";
import { PDFDocument, StandardFontEmbedder, StandardFonts } from "pdf-lib";
import gad7Json from "@content/measures/gad-7.json";
import phq9Json from "@content/measures/phq-9.json";
import { HandoutSchema, MeasureSchema, type Handout, type Measure } from "@/lib/schemas";
import {
  PAGE_HEIGHT,
  PAGE_MARGIN,
  PAGE_WIDTH,
  PDF_APP_NAME,
  PDF_CRISIS_HEADING,
  PDF_CRISIS_LINE,
  PDF_DISCLAIMER,
  createBlankMeasurePdf,
  createHandoutPdf,
  handoutPdfLayout,
  handoutPdfLines,
  layoutPageLines,
  measurePdfLayout,
  measurePdfLines,
  toWinAnsi,
  wrapText,
  type PdfLayout,
} from "@/lib/pdf";
import { downloadBytes, safeFilename } from "@/lib/download";
import handoutJson from "../fixtures/pdf-handout.json";

const gad7: Measure = MeasureSchema.parse(gad7Json);
const phq9: Measure = MeasureSchema.parse(phq9Json);
const handout: Handout = HandoutSchema.parse(handoutJson);

type FontName = Parameters<typeof StandardFontEmbedder.for>[0];
const fonts = {
  regular: StandardFontEmbedder.for(StandardFonts.Helvetica as unknown as FontName),
  bold: StandardFontEmbedder.for(StandardFonts.HelveticaBold as unknown as FontName),
};

const IDENTIFIER_LABELS =
  /\bDOB\b|date of birth|birth ?date|address|phone|\bMRN\b|medical record|\bSSN\b|social security|e-?mail|insurance|member id|\bzip\b/i;

function joined(lines: string[]): string {
  return lines.join(" ");
}

function expectFooterOnEveryPage(layout: PdfLayout) {
  const pages = layoutPageLines(layout);
  expect(pages.length).toBeGreaterThanOrEqual(1);
  pages.forEach((lines, i) => {
    expect(lines).toContain(PDF_DISCLAIMER);
    expect(lines).toContain(`Page ${i + 1} of ${pages.length}`);
    expect(lines).toContain(PDF_APP_NAME);
  });
}

function expectInsideMargins(layout: PdfLayout) {
  for (const page of layout.pages) {
    for (const op of page.ops) {
      if (op.kind === "text") {
        const w = (op.bold ? fonts.bold : fonts.regular).widthOfTextAtSize(op.text, op.size);
        expect(op.x, op.text).toBeGreaterThanOrEqual(PAGE_MARGIN - 0.01);
        expect(op.x + w, op.text).toBeLessThanOrEqual(PAGE_WIDTH - PAGE_MARGIN + 0.01);
        expect(op.y, op.text).toBeGreaterThanOrEqual(PAGE_MARGIN);
        expect(op.y + op.size, op.text).toBeLessThanOrEqual(PAGE_HEIGHT - PAGE_MARGIN + 0.01);
        expect(toWinAnsi(op.text), "text is already WinAnsi-safe").toBe(op.text);
      } else if (op.kind === "rect") {
        expect(op.x).toBeGreaterThanOrEqual(PAGE_MARGIN - 0.01);
        expect(op.x + op.w).toBeLessThanOrEqual(PAGE_WIDTH - PAGE_MARGIN + 0.01);
        expect(op.y).toBeGreaterThanOrEqual(PAGE_MARGIN);
        expect(op.y + op.h).toBeLessThanOrEqual(PAGE_HEIGHT - PAGE_MARGIN + 0.01);
      }
    }
  }
}

async function expectValidPdf(bytes: Uint8Array, layout: PdfLayout, title: string) {
  expect(bytes).toBeInstanceOf(Uint8Array);
  expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
  expect(doc.getPageCount()).toBe(layout.pages.length);
  for (const p of doc.getPages()) expect(p.getSize()).toEqual({ width: PAGE_WIDTH, height: PAGE_HEIGHT });
  expect(doc.getTitle()).toBe(title);
  expect(doc.getProducer()).toBe(PDF_APP_NAME);
  expect(doc.getCreator()).toBe(PDF_APP_NAME);
  expect(doc.getAuthor()).toBeUndefined();
  expect(doc.getCreationDate()).toBeUndefined();
}

describe("toWinAnsi", () => {
  it("maps symbols that standard fonts cannot encode", () => {
    expect(toWinAnsi("score ≥ 10")).toBe("score >= 10");
    expect(toWinAnsi("score ≤ 4")).toBe("score <= 4");
    expect(toWinAnsi("tense → relaxed")).toBe("tense -> relaxed");
    expect(toWinAnsi("5 − 3")).toBe("5 - 3");
    expect(toWinAnsi("☐ yes ✓")).toBe("[ ] yes x");
  });

  it("keeps smart quotes, dashes, bullets and Latin-1 letters", () => {
    const s = "“quoted” ‘single’ – — • … · café Löwe";
    expect(toWinAnsi(s)).toBe(s);
  });

  it("decomposes or strips everything else", () => {
    expect(toWinAnsi("ﬁne")).toBe("fine");
    expect(toWinAnsi("Dvořák")).toBe("Dvorák");
    expect(toWinAnsi("hi 🙂 there")).toBe("hi  there");
    expect(toWinAnsi("日本 ok")).toBe(" ok");
    expect(toWinAnsi("a\u0007b​c")).toBe("abc");
    expect(toWinAnsi("tab\there\nnew line")).toBe("tab here new line");
    expect(toWinAnsi("soft­hyphen")).toBe("softhyphen");
  });

  it("is idempotent", () => {
    const s = "≥ → “x” 🙂 Dvořák";
    expect(toWinAnsi(toWinAnsi(s))).toBe(toWinAnsi(s));
  });
});

describe("wrapText", () => {
  it("wraps to the width and keeps every word", () => {
    const text = "Little interest or pleasure in doing things, repeated a few times to need wrapping.";
    const lines = wrapText(text, 10, 120);
    expect(lines.length).toBeGreaterThan(1);
    for (const l of lines) expect(fonts.regular.widthOfTextAtSize(l, 10)).toBeLessThanOrEqual(120);
    expect(lines.join(" ")).toBe(text);
  });

  it("splits a single word longer than the line", () => {
    const lines = wrapText("x".repeat(200), 10, 100);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join("")).toBe("x".repeat(200));
  });
});

describe.each([
  ["GAD-7", gad7],
  ["PHQ-9", phq9],
] as const)("blank measure PDF: %s", (_name, measure) => {
  it("renders a valid US Letter PDF with metadata and no author", async () => {
    const bytes = await createBlankMeasurePdf(measure);
    await expectValidPdf(bytes, measurePdfLayout(measure), measure.name);
  });

  it("has the footer on every page and stays inside the 0.75in margins", () => {
    const layout = measurePdfLayout(measure);
    expectFooterOnEveryPage(layout);
    expectInsideMargins(layout);
  });

  it("contains the title, instructions, every item, option, totals, functional item and band key", () => {
    const lines = measurePdfLines(measure);
    const text = joined(lines);
    expect(text).toContain(measure.name);
    expect(text).toContain(measure.instructions);
    for (const item of measure.items) expect(text).toContain(`${item.id}. ${toWinAnsi(item.text)}`);
    for (const o of measure.options) {
      expect(text).toContain(`(${o.value})`);
      for (const word of o.label.split(" ")) expect(text).toContain(word);
    }
    expect(lines).toContain("Add columns:");
    expect(lines).toContain(`Total score (${measure.scoring.min}-${measure.scoring.max}):`);
    expect(text).toContain(measure.functionalItem?.text ?? "");
    for (const opt of measure.functionalItem?.options ?? []) expect(lines).toContain(opt);
    for (const b of measure.scoring.bands) expect(lines).toContain(`${b.min}-${b.max}: ${b.label}`);
    for (const r of measure.riskItems) expect(text).toContain(`Item ${r.itemId}: ${r.message}`);
    expect(text).toContain(measure.copyright);
    expect(text).toContain(`Citation: ${toWinAnsi(measure.citation)}`);
    expect(text).toContain(PDF_CRISIS_HEADING);
    expect(text).toContain(PDF_CRISIS_LINE);
  });

  it("has a blank Name line and no other identifier fields", () => {
    const lines = measurePdfLines(measure);
    const nameLines = lines.filter((l) => /^Name:/.test(l));
    expect(nameLines).toHaveLength(1);
    expect(nameLines[0]).toMatch(/^Name: _{10,}$/);
    for (const l of lines) expect(l, l).not.toMatch(IDENTIFIER_LABELS);
    expect(joined(lines)).not.toMatch(/Date:/);
  });
});

describe("handout PDF (fixture)", () => {
  it("renders a valid PDF with metadata", async () => {
    const bytes = await createHandoutPdf(handout);
    await expectValidPdf(bytes, handoutPdfLayout(handout), handout.title);
  });

  it("breaks pages automatically and puts the footer on every page", () => {
    const layout = handoutPdfLayout(handout);
    expect(layout.pages.length).toBeGreaterThanOrEqual(2);
    expectFooterOnEveryPage(layout);
    expectInsideMargins(layout);
  });

  it("contains title, intro, sections, numbered steps, practice log, safety note and crisis box", () => {
    const lines = handoutPdfLines(handout);
    const text = joined(lines);
    expect(text).toContain(handout.title);
    expect(text).toContain("About 10 minutes");
    for (const s of handout.sections) {
      expect(lines).toContain(s.heading);
      if (s.body) expect(text).toContain(s.body);
      for (const step of s.steps ?? []) expect(text).toContain(step);
    }
    expect(lines).toContain("1.");
    expect(lines).toContain("12.");
    expect(lines).toContain("Practice log");
    for (const c of handout.practiceLog?.columns ?? []) expect(text).toContain(c);
    // header row is repeated when the log continues on a new page
    expect(lines.filter((l) => l === "Day").length).toBeGreaterThanOrEqual(1);
    expect(lines).toContain("Safety note");
    expect(text).toContain(handout.safetyNote);
    expect(lines).toContain(PDF_CRISIS_HEADING);
    expect(text).toContain(PDF_CRISIS_LINE);
    expect(text).toContain("Fixture source for tests only (Test Publisher, 2026)");
  });

  it("sanitizes text for the standard fonts", () => {
    const text = joined(handoutPdfLines(handout));
    expect(text).toContain("an arrow -> and a sign >= so");
    expect(text).toContain("“smart quotes”");
    expect(text).not.toMatch(/[→≥🙂]/u);
  });

  it("has a blank Name line and no other identifier fields", () => {
    const lines = handoutPdfLines(handout);
    expect(lines.filter((l) => /^Name:/.test(l))).toHaveLength(1);
    for (const l of lines) expect(l, l).not.toMatch(IDENTIFIER_LABELS);
  });

  it("puts the log header on each page the practice log spans", () => {
    const big = HandoutSchema.parse({ ...handoutJson, practiceLog: { columns: ["Day", "Minutes"], rows: 60 } });
    const pages = layoutPageLines(handoutPdfLayout(big));
    const withLog = pages.filter((p) => p.includes("Minutes"));
    expect(withLog.length).toBeGreaterThanOrEqual(2);
  });
});

describe("downloadBytes", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("clicks a temporary object-URL anchor, then removes it and revokes the URL", () => {
    vi.useFakeTimers();
    const anchor = {
      href: "",
      download: "",
      rel: "",
      style: { display: "" },
      click: vi.fn(),
      remove: vi.fn(),
    };
    const appendChild = vi.fn();
    vi.stubGlobal("document", { createElement: vi.fn(() => anchor), body: { appendChild } });
    const createObjectURL = vi.fn((_b: Blob) => "blob:fake-url");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    downloadBytes(new Uint8Array([37, 80, 68, 70]), "GAD-7 blank form.pdf");

    const blob = createObjectURL.mock.calls[0]?.[0];
    expect(blob).toBeInstanceOf(Blob);
    expect(blob?.type).toBe("application/pdf");
    expect(blob?.size).toBe(4);
    expect(anchor.href).toBe("blob:fake-url");
    expect(anchor.download).toBe("GAD-7 blank form.pdf");
    expect(appendChild).toHaveBeenCalledWith(anchor);
    expect(anchor.click).toHaveBeenCalledTimes(1);
    expect(anchor.remove).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:fake-url");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("sanitizes file names", () => {
    expect(safeFilename("a/b\\c:d*e?.pdf")).toBe("a-b-c-d-e-.pdf");
    expect(safeFilename("   ")).toBe("download");
  });
});
