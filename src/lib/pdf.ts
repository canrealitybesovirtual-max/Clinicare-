/**
 * Printable PDFs, generated entirely in the browser with pdf-lib (spec section 11). Nothing is uploaded.
 *
 * - Blank measure forms (GAD-7, PHQ-9): the official wording from content/measures, empty checkboxes,
 *   column totals, a total-score box and a scoring key for the clinician. No answers or scores are ever
 *   written into a PDF here.
 * - Client handouts: original wording from content/handouts.
 * - The only personal field is a blank handwritten "Name" line. No other identifier fields (G5).
 * - Every page carries the disclaimer footer (G14), the app name and "Page x of y".
 * - Every PDF that reaches a client carries the crisis box (988 / local emergency / findahelpline.com) (G9).
 *
 * Layout is pure and synchronous (measurePdfLayout / handoutPdfLayout), using the standard-font metrics
 * from pdf-lib, so tests can assert content without decompressing PDF streams. The create* functions
 * only render that layout.
 */
import { PDFDocument, StandardFontEmbedder, StandardFonts, rgb } from "pdf-lib";
import type { Handout, Measure } from "./schemas";

export const PDF_APP_NAME = "Clinician Resource Companion";
export const PDF_DISCLAIMER = "Resource only. Not a substitute for clinical judgment.";
export const PDF_CRISIS_HEADING = "Need help now?";
export const PDF_CRISIS_LINE = "US: call or text 988 · Emergency: 911 or your local number · Other countries: findahelpline.com";
export const PDF_NAME_LINE = "Name: ________________________________________";

/* ---------------------------------------------------------------- page geometry (points) */

export const PAGE_WIDTH = 612; // US Letter 8.5in
export const PAGE_HEIGHT = 792; // 11in
export const PAGE_MARGIN = 54; // 0.75in
const CONTENT_W = PAGE_WIDTH - 2 * PAGE_MARGIN;
const FOOTER_H = 30; // footer sits inside the content box, above the bottom margin
const TOP = PAGE_HEIGHT - PAGE_MARGIN;
const BOTTOM = PAGE_MARGIN + FOOTER_H;
const LEFT = PAGE_MARGIN;
const RIGHT = PAGE_WIDTH - PAGE_MARGIN;

/* ---------------------------------------------------------------- layout model */

export type PdfColor = "text" | "muted" | "border" | "headFill" | "stripe" | "crisis" | "crisisFill";

export type PdfOp =
  | { kind: "text"; text: string; x: number; y: number; size: number; bold: boolean; color: PdfColor }
  | { kind: "rect"; x: number; y: number; w: number; h: number; stroke?: PdfColor; fill?: PdfColor; lineWidth?: number }
  | { kind: "line"; x1: number; y1: number; x2: number; y2: number; color: PdfColor; lineWidth: number };

export interface PdfPageLayout {
  ops: PdfOp[];
}

export interface PdfLayout {
  title: string;
  pages: PdfPageLayout[];
}

const COLORS: Record<PdfColor, [number, number, number]> = {
  text: [0.07, 0.09, 0.15],
  muted: [0.33, 0.36, 0.43],
  border: [0.58, 0.61, 0.67],
  headFill: [0.92, 0.93, 0.95],
  stripe: [0.975, 0.978, 0.985],
  crisis: [0.68, 0.1, 0.1],
  crisisFill: [0.995, 0.95, 0.95],
};

/* ---------------------------------------------------------------- text: WinAnsi + metrics */

type FontName = Parameters<typeof StandardFontEmbedder.for>[0];
let metricsCache: { regular: StandardFontEmbedder; bold: StandardFontEmbedder } | null = null;
function metrics() {
  metricsCache ??= {
    regular: StandardFontEmbedder.for(StandardFonts.Helvetica as unknown as FontName),
    bold: StandardFontEmbedder.for(StandardFonts.HelveticaBold as unknown as FontName),
  };
  return metricsCache;
}

const REPLACEMENTS: Record<string, string> = {
  "≥": ">=", // greater-than or equal
  "≤": "<=", // less-than or equal
  "→": "->", // right arrow
  "←": "<-",
  "↔": "<->",
  "⇒": "=>",
  "≠": "!=",
  "≈": "~",
  "−": "-", // minus sign
  "‐": "-", // hyphen
  "‑": "-", // non-breaking hyphen
  "‒": "-", // figure dash
  "―": "—", // horizontal bar -> em dash
  "′": "'", // prime
  "″": '"', // double prime
  "‛": "'",
  "‟": '"',
  "✓": "x", // check marks
  "✔": "x",
  "✗": "x",
  "☐": "[ ]", // ballot boxes
  "☑": "[x]",
  "☒": "[x]",
  " ": " ", // no-break space
  "­": "", // soft hyphen
  "\t": " ",
  "\n": " ",
  "\r": " ",
  " ": " ",
  " ": " ",
};

function canEncode(ch: string): boolean {
  const cp = ch.codePointAt(0);
  if (cp === undefined || cp < 0x20 || cp === 0x7f) return false;
  return metrics().regular.encoding.canEncodeUnicodeCodePoint(cp);
}

function mapChar(ch: string): string {
  const rep = REPLACEMENTS[ch];
  if (rep !== undefined) return rep;
  if (/\s/u.test(ch) && ch !== " ") return " "; // other Unicode spaces
  return canEncode(ch) ? ch : "";
}

/**
 * Make a string safe for the WinAnsi-encoded standard fonts: maps symbols (>=, <=, ->, check marks),
 * keeps smart quotes, dashes, bullets and Latin-1 letters, decomposes other accented letters and
 * ligatures (NFKD), and drops anything else (emoji, CJK, control characters).
 */
export function toWinAnsi(input: string): string {
  let out = "";
  for (const ch of input) {
    const direct = mapChar(ch);
    if (direct !== "" || REPLACEMENTS[ch] === "") {
      out += direct;
      continue;
    }
    for (const d of ch.normalize("NFKD")) out += mapChar(d);
  }
  return out;
}

function widthOf(text: string, size: number, bold = false): number {
  const m = metrics();
  return (bold ? m.bold : m.regular).widthOfTextAtSize(text, size);
}

/** Word-wrap already-sanitized or raw text to maxWidth. "\n" starts a new line. Long words are split. */
export function wrapText(text: string, size: number, maxWidth: number, bold = false): string[] {
  const out: string[] = [];
  for (const para of text.split(/\r?\n/)) {
    const words = toWinAnsi(para).split(" ").filter(Boolean);
    if (words.length === 0) {
      out.push("");
      continue;
    }
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (widthOf(candidate, size, bold) <= maxWidth) {
        line = candidate;
        continue;
      }
      if (line) out.push(line);
      let rest = word;
      while (widthOf(rest, size, bold) > maxWidth && rest.length > 1) {
        let n = rest.length - 1;
        while (n > 1 && widthOf(rest.slice(0, n), size, bold) > maxWidth) n -= 1;
        out.push(rest.slice(0, n));
        rest = rest.slice(n);
      }
      line = rest;
    }
    if (line) out.push(line);
  }
  return out;
}

/* ---------------------------------------------------------------- layout builder */

interface TextStyle {
  size?: number;
  bold?: boolean;
  color?: PdfColor;
  indent?: number;
  width?: number;
  lineHeight?: number; // multiple of size
}

class LayoutBuilder {
  readonly pages: PdfPageLayout[] = [];
  y = TOP;

  constructor(readonly title: string) {
    this.newPage();
  }

  get ops(): PdfOp[] {
    const page = this.pages[this.pages.length - 1];
    if (!page) throw new Error("no page");
    return page.ops;
  }

  get atTop(): boolean {
    return this.y >= TOP;
  }

  newPage(): void {
    this.pages.push({ ops: [] });
    this.y = TOP;
  }

  /** Start a new page when `height` does not fit (never loops on blocks taller than a page). */
  ensure(height: number): boolean {
    if (this.y - height < BOTTOM && !this.atTop) {
      this.newPage();
      return true;
    }
    return false;
  }

  gap(h: number): void {
    if (!this.atTop) this.y -= h;
  }

  text(text: string, x: number, y: number, size: number, bold = false, color: PdfColor = "text"): void {
    this.ops.push({ kind: "text", text: toWinAnsi(text), x, y, size, bold, color });
  }

  rect(x: number, y: number, w: number, h: number, opts: { stroke?: PdfColor; fill?: PdfColor; lineWidth?: number }): void {
    this.ops.push({ kind: "rect", x, y, w, h, ...opts });
  }

  line(x1: number, y1: number, x2: number, y2: number, color: PdfColor = "border", lineWidth = 0.75): void {
    this.ops.push({ kind: "line", x1, y1, x2, y2, color, lineWidth });
  }

  paragraph(text: string, style: TextStyle = {}): void {
    const size = style.size ?? 10;
    const bold = style.bold ?? false;
    const indent = style.indent ?? 0;
    const lh = size * (style.lineHeight ?? 1.35);
    const lines = wrapText(text, size, (style.width ?? CONTENT_W) - indent, bold);
    for (const l of lines) {
      this.ensure(lh);
      this.text(l, LEFT + indent, this.y - size, size, bold, style.color ?? "text");
      this.y -= lh;
    }
  }

  heading(text: string, size: number, keepWith = 3 * 14): void {
    this.ensure(size * 1.4 + keepWith);
    this.paragraph(text, { size, bold: true, lineHeight: 1.3 });
    this.y -= 2;
  }

  /** Numbered list with a hanging indent. */
  numbered(steps: string[], size: number): void {
    const lh = size * 1.4;
    const indent = 20;
    steps.forEach((step, i) => {
      const lines = wrapText(step, size, CONTENT_W - indent);
      lines.forEach((l, j) => {
        this.ensure(lh);
        if (j === 0) this.text(`${i + 1}.`, LEFT, this.y - size, size, true);
        this.text(l, LEFT + indent, this.y - size, size);
        this.y -= lh;
      });
      this.y -= size * 0.3;
    });
  }

  nameLine(): void {
    this.ensure(28);
    this.text(PDF_NAME_LINE, LEFT, this.y - 11, 11);
    this.y -= 26;
  }

  crisisBox(): void {
    const pad = 9;
    const size = 10;
    const lines = wrapText(PDF_CRISIS_LINE, size, CONTENT_W - 2 * pad, true);
    const h = pad + 13 + lines.length * size * 1.4 + pad - 2;
    this.ensure(h + 4);
    const top = this.y;
    this.rect(LEFT, top - h, CONTENT_W, h, { stroke: "crisis", fill: "crisisFill", lineWidth: 1.25 });
    this.text(PDF_CRISIS_HEADING, LEFT + pad, top - pad - 10, 11, true, "crisis");
    let y = top - pad - 13 - size - 3;
    for (const l of lines) {
      this.text(l, LEFT + pad, y, size, true);
      y -= size * 1.4;
    }
    this.y = top - h;
  }

  /** Add the footer (disclaimer, app name, "Page x of y") to every page. */
  finish(): PdfLayout {
    const n = this.pages.length;
    this.pages.forEach((page, i) => {
      const sep = BOTTOM - 8;
      page.ops.push({ kind: "line", x1: LEFT, y1: sep, x2: RIGHT, y2: sep, color: "border", lineWidth: 0.5 });
      page.ops.push({ kind: "text", text: PDF_DISCLAIMER, x: LEFT, y: sep - 11, size: 8.5, bold: true, color: "text" });
      const pageLabel = `Page ${i + 1} of ${n}`;
      page.ops.push({
        kind: "text",
        text: pageLabel,
        x: RIGHT - widthOf(pageLabel, 8.5),
        y: sep - 11,
        size: 8.5,
        bold: false,
        color: "text",
      });
      page.ops.push({ kind: "text", text: PDF_APP_NAME, x: LEFT, y: sep - 21, size: 7.5, bold: false, color: "muted" });
    });
    return { title: this.title, pages: this.pages };
  }
}

/* ---------------------------------------------------------------- measure form */

const CHECKBOX = 10;

export function measurePdfLayout(measure: Measure): PdfLayout {
  const b = new LayoutBuilder(toWinAnsi(measure.name));
  const { min, max } = measure.scoring;

  b.paragraph(measure.name, { size: 16, bold: true, lineHeight: 1.3 });
  b.y -= 4;
  b.nameLine();
  b.paragraph(measure.instructions, { size: 10.5, bold: true });
  b.y -= 4;

  // ---- items table
  const nOpt = measure.options.length;
  const optW = Math.min(64, (CONTENT_W * 0.55) / nOpt);
  const textColW = CONTENT_W - optW * nOpt;
  const numW = 20;
  const pad = 4;
  const optX = (i: number) => LEFT + textColW + i * optW;
  const itemSize = 9.5;
  const itemLh = itemSize * 1.25;
  const headSize = 8;
  const headLh = headSize * 1.25;

  const cornerLines = wrapText("Mark one box for each question.", 8.5, textColW - 2 * pad);
  const headLines = measure.options.map((o) => wrapText(`${o.label} (${o.value})`, headSize, optW - 6, true));
  const headH = Math.max(cornerLines.length, ...headLines.map((l) => l.length)) * headLh + 2 * pad + 2;
  const rowLines = measure.items.map((it) => wrapText(it.text, itemSize, textColW - numW - 2 * pad));
  const rowH = rowLines.map((l) => Math.max(l.length * itemLh + 2 * pad, 20));

  const drawHeader = () => {
    const top = b.y;
    b.rect(LEFT, top - headH, CONTENT_W, headH, { fill: "headFill", stroke: "border", lineWidth: 0.75 });
    cornerLines.forEach((l, j) => b.text(l, LEFT + pad, top - pad - 1 - headSize - j * headLh, 8.5, false, "muted"));
    headLines.forEach((lines, i) => {
      const x = optX(i);
      b.line(x, top, x, top - headH);
      lines.forEach((l, j) => {
        b.text(l, x + (optW - widthOf(l, headSize, true)) / 2, top - pad - 1 - headSize - j * headLh, headSize, true);
      });
    });
    b.y = top - headH;
  };

  b.ensure(headH + (rowH[0] ?? 20));
  drawHeader();
  measure.items.forEach((it, idx) => {
    const h = rowH[idx] ?? 20;
    if (b.ensure(h)) drawHeader();
    const top = b.y;
    b.rect(LEFT, top - h, CONTENT_W, h, { fill: idx % 2 === 1 ? "stripe" : undefined, stroke: "border", lineWidth: 0.75 });
    const firstBaseline = top - pad - itemSize + 1;
    b.text(`${it.id}.`, LEFT + pad, firstBaseline, itemSize, true);
    (rowLines[idx] ?? []).forEach((l, j) => b.text(l, LEFT + numW + pad, firstBaseline - j * itemLh, itemSize));
    for (let i = 0; i < nOpt; i++) {
      const x = optX(i);
      b.line(x, top, x, top - h);
      b.rect(x + (optW - CHECKBOX) / 2, top - h / 2 - CHECKBOX / 2, CHECKBOX, CHECKBOX, { stroke: "text", lineWidth: 0.9 });
    }
    b.y = top - h;
  });

  // column totals ("add columns") row, then the total score box
  const totalsH = 22;
  const totalH = 24;
  if (b.ensure(totalsH + totalH)) drawHeader();
  {
    const top = b.y;
    const mid = top - totalsH / 2 - 3.3;
    b.rect(LEFT, top - totalsH, CONTENT_W, totalsH, { fill: "headFill", stroke: "border", lineWidth: 0.75 });
    const label = "Add columns:";
    b.text(label, LEFT + textColW - pad - 4 - widthOf(label, 9.5, true), mid, 9.5, true);
    for (let i = 0; i < nOpt; i++) {
      const x = optX(i);
      b.rect(x + 8, top - totalsH + 5, optW - 16, totalsH - 10, { stroke: "text", lineWidth: 0.75 });
      if (i > 0) b.text("+", x - widthOf("+", 9, true) / 2, mid, 9, true);
    }
    b.y = top - totalsH;
  }
  {
    const top = b.y;
    b.rect(LEFT, top - totalH, CONTENT_W, totalH, { stroke: "border", lineWidth: 0.75 });
    const label = `Total score (${min}-${max}):`;
    const boxW = optW - 16;
    const boxX = optX(nOpt - 1) + 8;
    b.text(label, boxX - 10 - widthOf(label, 10, true), top - totalH / 2 - 3.5, 10, true);
    b.rect(boxX, top - totalH + 4, boxW, totalH - 8, { stroke: "text", lineWidth: 1.1 });
    b.y = top - totalH;
  }
  b.y -= 10;

  // ---- functional difficulty item (not scored)
  if (measure.functionalItem) {
    b.heading(measure.functionalItem.text, 9.5, 18);
    const size = 9.5;
    const lh = 16;
    let x = LEFT;
    b.ensure(lh);
    for (const opt of measure.functionalItem.options) {
      const label = toWinAnsi(opt);
      const w = CHECKBOX + 5 + widthOf(label, size) + 18;
      if (x > LEFT && x + w - 18 > RIGHT) {
        b.y -= lh;
        b.ensure(lh);
        x = LEFT;
      }
      b.rect(x, b.y - CHECKBOX, CHECKBOX, CHECKBOX, { stroke: "text", lineWidth: 0.9 });
      b.text(label, x + CHECKBOX + 5, b.y - CHECKBOX + 1.5, size);
      x += w;
    }
    b.y -= lh + 4;
  }

  // ---- scoring key for the clinician: one cell per severity band
  const bands = [...measure.scoring.bands].sort((p, q) => p.min - q.min);
  const bandW = CONTENT_W / bands.length;
  const bandLabelLines = bands.map((band) => wrapText(band.label, 8.5, bandW - 2 * pad));
  const bandH = 2 * pad + 10 + Math.max(...bandLabelLines.map((l) => l.length)) * 10.5;
  b.heading("Scoring key (for clinician use)", 10, bandH + 24);
  {
    const top = b.y;
    b.rect(LEFT, top - bandH, CONTENT_W, bandH, { stroke: "border", lineWidth: 0.75 });
    bands.forEach((band, i) => {
      const x = LEFT + i * bandW;
      if (i > 0) b.line(x, top, x, top - bandH);
      b.text(`${band.min}-${band.max}`, x + pad + 1, top - pad - 8.5, 8.5, true);
      (bandLabelLines[i] ?? []).forEach((l, j) => b.text(l, x + pad + 1, top - pad - 19 - j * 10.5, 8.5));
    });
    b.y = top - bandH - 4;
  }
  const notScored = measure.functionalItem ? "; the difficulty question is not added" : "";
  b.paragraph(
    `Add the column totals for a total score from ${min} to ${max} (every item must be answered${notScored}). ` +
      "A total is screening information for clinician review, not a diagnosis.",
    { size: 8.5, lineHeight: 1.3 },
  );
  for (const r of measure.riskItems) b.paragraph(r.message, { size: 8.5, bold: true, lineHeight: 1.3 });
  b.y -= 6;

  b.crisisBox();
  b.y -= 6;

  // ---- copyright and citation
  b.paragraph(measure.copyright, { size: 7, color: "muted", lineHeight: 1.3 });
  const loinc = measure.loinc
    ? ` LOINC: panel ${measure.loinc.panel}${measure.loinc.total ? `, total score ${measure.loinc.total}` : ""}.`
    : "";
  b.paragraph(`Citation: ${measure.citation}${loinc}`, { size: 7, color: "muted", lineHeight: 1.3 });

  return b.finish();
}

/* ---------------------------------------------------------------- client handout */

export function handoutPdfLayout(handout: Handout): PdfLayout {
  const b = new LayoutBuilder(toWinAnsi(handout.title));
  const body = 11;

  b.paragraph(handout.title, { size: 18, bold: true, lineHeight: 1.25 });
  b.y -= 6;
  b.nameLine();
  b.paragraph(`About ${handout.estimatedMinutes} minutes`, { size: 9.5, color: "muted" });
  b.y -= 4;
  b.paragraph(handout.intro, { size: body, lineHeight: 1.45 });
  b.y -= 8;

  for (const section of handout.sections) {
    b.heading(section.heading, 13, 2 * body * 1.45);
    if (section.body) b.paragraph(section.body, { size: body, lineHeight: 1.45 });
    if (section.steps && section.steps.length > 0) {
      if (section.body) b.y -= 4;
      b.numbered(section.steps, body);
    }
    b.y -= 8;
  }

  // ---- practice log
  if (handout.practiceLog) {
    const cols = handout.practiceLog.columns;
    const colW = CONTENT_W / cols.length;
    const pad = 5;
    const headSize = 9;
    const headLh = headSize * 1.3;
    const headLines = cols.map((c) => wrapText(c, headSize, colW - 2 * pad, true));
    const headH = Math.max(...headLines.map((l) => l.length)) * headLh + 2 * pad;
    const rowH = 26;
    const drawHeader = () => {
      const top = b.y;
      b.rect(LEFT, top - headH, CONTENT_W, headH, { fill: "headFill", stroke: "border", lineWidth: 0.75 });
      headLines.forEach((lines, i) => {
        const x = LEFT + i * colW;
        if (i > 0) b.line(x, top, x, top - headH);
        lines.forEach((l, j) => b.text(l, x + pad, top - pad - headSize - j * headLh, headSize, true));
      });
      b.y = top - headH;
    };

    b.heading("Practice log", 13, headH + rowH);
    drawHeader();
    for (let r = 0; r < handout.practiceLog.rows; r++) {
      if (b.ensure(rowH)) drawHeader();
      const top = b.y;
      b.rect(LEFT, top - rowH, CONTENT_W, rowH, { stroke: "border", lineWidth: 0.75 });
      for (let i = 1; i < cols.length; i++) b.line(LEFT + i * colW, top, LEFT + i * colW, top - rowH);
      b.y = top - rowH;
    }
    b.y -= 14;
  }

  // ---- safety note + crisis box
  b.heading("Safety note", 12, 2 * body * 1.45);
  b.paragraph(handout.safetyNote, { size: body, lineHeight: 1.45 });
  b.y -= 10;
  b.crisisBox();
  b.y -= 12;

  // ---- sources
  const sources = handout.sources.map((s) => `${s.title} (${s.publisher}${s.year ? `, ${s.year}` : ""})`);
  b.paragraph(`Sources: ${sources.join("; ")}.`, { size: 7.5, color: "muted" });
  b.paragraph("Talk with your counselor or therapist about any questions on this sheet.", { size: 7.5, color: "muted" });

  return b.finish();
}

/* ---------------------------------------------------------------- pure test/inspection helpers */

/** Text lines per page, in drawing order (footer lines last on each page). */
export function layoutPageLines(layout: PdfLayout): string[][] {
  return layout.pages.map((p) => p.ops.flatMap((op) => (op.kind === "text" ? [op.text] : [])));
}

export function measurePdfLines(measure: Measure): string[] {
  return layoutPageLines(measurePdfLayout(measure)).flat();
}

export function handoutPdfLines(handout: Handout): string[] {
  return layoutPageLines(handoutPdfLayout(handout)).flat();
}

/* ---------------------------------------------------------------- rendering */

async function renderLayout(layout: PdfLayout): Promise<Uint8Array> {
  // updateMetadata: false => no automatic creation/modification dates; author is never set.
  const doc = await PDFDocument.create({ updateMetadata: false });
  doc.setTitle(layout.title, { showInWindowTitleBar: true });
  doc.setProducer(PDF_APP_NAME);
  doc.setCreator(PDF_APP_NAME);
  doc.setLanguage("en-US");

  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const color = (c: PdfColor) => rgb(...COLORS[c]);

  for (const p of layout.pages) {
    const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    for (const op of p.ops) {
      if (op.kind === "text") {
        if (op.text) page.drawText(op.text, { x: op.x, y: op.y, size: op.size, font: op.bold ? bold : regular, color: color(op.color) });
      } else if (op.kind === "rect") {
        page.drawRectangle({
          x: op.x,
          y: op.y,
          width: op.w,
          height: op.h,
          color: op.fill ? color(op.fill) : undefined,
          borderColor: op.stroke ? color(op.stroke) : undefined,
          borderWidth: op.stroke ? (op.lineWidth ?? 0.75) : 0,
        });
      } else {
        page.drawLine({
          start: { x: op.x1, y: op.y1 },
          end: { x: op.x2, y: op.y2 },
          thickness: op.lineWidth,
          color: color(op.color),
        });
      }
    }
  }
  return doc.save();
}

/** Blank, printable measure form (no answers, no scores). */
export function createBlankMeasurePdf(measure: Measure): Promise<Uint8Array> {
  return renderLayout(measurePdfLayout(measure));
}

/** Printable client handout. */
export function createHandoutPdf(handout: Handout): Promise<Uint8Array> {
  return renderLayout(handoutPdfLayout(handout));
}
