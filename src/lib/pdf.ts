/**
 * Printable PDFs, generated entirely in the browser with pdf-lib (spec section 11). Nothing is uploaded.
 *
 * - Blank measure forms (GAD-7, PHQ-9): the official wording from content/measures, empty checkboxes,
 *   column totals, a total-score box and a scoring key for the clinician. No answers or scores are ever
 *   written into a PDF here.
 * - Client handouts: original wording from content/handouts, in English or in its Spanish translation
 *   (HandoutSchema.es). A Spanish handout PDF also has its footer, crisis box, name line and Part 2 notice in
 *   Spanish; the Part 2 notice keeps the exact English sentence under the Spanish one.
 * - The only personal field is a blank handwritten "Name" line. No other identifier fields (G5).
 * - Every page carries the disclaimer footer (G14), the app name and "Page x of y".
 * - Every PDF that reaches a client carries the crisis box (988 / local emergency / findahelpline.com) (G9).
 * - Substance-use handouts (sud: true) carry the 42 CFR Part 2 notice in every page footer (G6).
 * - Client handouts never name a diagnosis: source credits pass the client-safe filter (G3).
 * - Blank measure forms: page 1 is the client's form; the scoring key and risk-item notes are on a
 *   separate clinician page.
 *
 * Layout is pure and synchronous (measurePdfLayout / handoutPdfLayout), using the standard-font metrics
 * from pdf-lib, so tests can assert content without decompressing PDF streams. The create* functions
 * only render that layout. The plan and tools exports (src/lib/plan-export.ts, src/lib/tools/doc-export.ts)
 * lay out their own blocks but share this module's geometry, text metrics, footer (stampPdfFooters) and
 * renderer (renderPdf).
 */
import { PDFDocument, StandardFontEmbedder, StandardFonts, rgb } from "pdf-lib";
import type { Handout, Measure } from "./schemas";
import type { Lang } from "./i18n/core";
import { clientSourceCredits } from "./client-safe";
import { PART2_NOTICE } from "./referral-links";
import { HANDOUT_TEXT, localizeHandout, withN } from "@/components/handouts/localize";

export const PDF_APP_NAME = "Clinician Resource Companion";
export const PDF_DISCLAIMER = "Resource only. Not a substitute for clinical judgment.";
export const PDF_CRISIS_HEADING = "Need help now?";
export const PDF_CRISIS_LINE = "US: call or text 988 · Emergency: 911 or your local number · Other countries: findahelpline.com";
export const PDF_NAME_LINE = "Name: ________________________________________";
export const PDF_CLINICIAN_PAGE_NOTE =
  "Clinician page: keep this page. Give the client only the form on page 1.";
/** G6: printed in the footer of every page of a substance-use (sud) export. Exact SPEC wording. */
export const PDF_PART2_NOTICE = PART2_NOTICE;

/** Wording every page and every client PDF carries (footer, crisis box, name line), per language. */
export interface PdfShellCopy {
  disclaimer: string;
  crisisHeading: string;
  crisisLine: string;
  nameLine: string;
  page: (page: number, pages: number) => string;
  /** PDF /Lang entry (BCP 47). */
  language: string;
}

export const PDF_COPY: Record<Lang, PdfShellCopy> = {
  en: {
    disclaimer: PDF_DISCLAIMER,
    crisisHeading: PDF_CRISIS_HEADING,
    crisisLine: PDF_CRISIS_LINE,
    nameLine: PDF_NAME_LINE,
    page: (i, n) => `Page ${i} of ${n}`,
    language: "en-US",
  },
  es: {
    disclaimer: "Solo es un recurso. No sustituye el juicio clínico.",
    crisisHeading: "¿Necesita ayuda ahora?",
    crisisLine:
      "EE. UU.: llame o envíe un mensaje de texto al 988 y pida atención en español · Emergencias: 911 o el número local · Otros países: findahelpline.com",
    nameLine: "Nombre: ________________________________________",
    page: (i, n) => `Página ${i} de ${n}`,
    language: "es",
  },
};

/** Spanish wording of the Part 2 notice; Spanish PDFs print it above the exact English sentence. */
export const PDF_PART2_NOTICE_ES = "La ley federal 42 CFR Part 2 prohíbe el uso o la divulgación no autorizados de estos registros.";

/** Lines around the handout body that are not part of the handout content. */
const HANDOUT_PDF_TEXT: Record<Lang, { basedOn: string; questions: string }> = {
  en: {
    basedOn: "Based on information from:",
    questions: "Talk with your counselor or therapist about any questions on this sheet.",
  },
  es: {
    basedOn: "Basado en información de:",
    questions: "Hable con su consejero o terapeuta si tiene preguntas sobre esta hoja.",
  },
};

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

/** Content box shared by every PDF this app makes (points; `bottom` is above the footer band). */
export const PDF_CONTENT = { top: TOP, bottom: BOTTOM, left: LEFT, right: RIGHT, width: CONTENT_W } as const;

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
  /** PDF /Lang entry; English (en-US) when absent. */
  language?: string;
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

/** Width in points of WinAnsi text in Helvetica (bold: Helvetica-Bold). */
export function pdfTextWidth(text: string, size: number, bold = false): number {
  const m = metrics();
  return (bold ? m.bold : m.regular).widthOfTextAtSize(text, size);
}
const widthOf = pdfTextWidth;

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

const NOTICE_SIZE = 7.5;
const NOTICE_LH = 9.5;

/** A footer notice (e.g. 42 CFR Part 2, G6) wrapped for every page, and the content bottom that leaves room for it. */
export function pdfFooterNotice(text?: string): { lines: string[]; bottom: number } {
  const lines = text ? wrapText(text, NOTICE_SIZE, CONTENT_W, true) : [];
  return { lines, bottom: BOTTOM + (lines.length ? lines.length * NOTICE_LH + 6 : 0) };
}

/**
 * Footer on every page (G14): the notice (when given) above a separator, then the disclaimer, "Page x of y" and
 * the app name.
 */
export function stampPdfFooters(
  pages: PdfPageLayout[],
  opts: { disclaimer: string; pageLabel: (page: number, pages: number) => string; notice: { lines: string[]; bottom: number } },
): void {
  const n = pages.length;
  const sep = BOTTOM - 8;
  pages.forEach((page, i) => {
    opts.notice.lines.forEach((l, j) => {
      page.ops.push({ kind: "text", text: l, x: LEFT, y: opts.notice.bottom - 4 - NOTICE_SIZE - j * NOTICE_LH, size: NOTICE_SIZE, bold: true, color: "text" });
    });
    page.ops.push({ kind: "line", x1: LEFT, y1: sep, x2: RIGHT, y2: sep, color: "border", lineWidth: 0.5 });
    page.ops.push({ kind: "text", text: toWinAnsi(opts.disclaimer), x: LEFT, y: sep - 11, size: 8.5, bold: true, color: "text" });
    const label = toWinAnsi(opts.pageLabel(i + 1, n));
    page.ops.push({ kind: "text", text: label, x: RIGHT - widthOf(label, 8.5), y: sep - 11, size: 8.5, bold: false, color: "text" });
    page.ops.push({ kind: "text", text: PDF_APP_NAME, x: LEFT, y: sep - 21, size: 7.5, bold: false, color: "muted" });
  });
}

class LayoutBuilder {
  readonly pages: PdfPageLayout[] = [];
  y = TOP;
  /** Lowest y content may reach; raised when a footer notice needs room. */
  readonly bottom: number;
  private readonly notice: { lines: string[]; bottom: number };
  readonly copy: PdfShellCopy;

  constructor(
    readonly title: string,
    opts: { footerNotice?: string; copy?: PdfShellCopy } = {},
  ) {
    this.copy = opts.copy ?? PDF_COPY.en;
    this.notice = pdfFooterNotice(opts.footerNotice);
    this.bottom = this.notice.bottom;
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
    if (this.y - height < this.bottom && !this.atTop) {
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
    this.text(this.copy.nameLine, LEFT, this.y - 11, 11);
    this.y -= 26;
  }

  crisisBox(): void {
    const pad = 9;
    const size = 10;
    const lines = wrapText(this.copy.crisisLine, size, CONTENT_W - 2 * pad, true);
    const h = pad + 13 + lines.length * size * 1.4 + pad - 2;
    this.ensure(h + 4);
    const top = this.y;
    this.rect(LEFT, top - h, CONTENT_W, h, { stroke: "crisis", fill: "crisisFill", lineWidth: 1.25 });
    this.text(this.copy.crisisHeading, LEFT + pad, top - pad - 10, 11, true, "crisis");
    let y = top - pad - 13 - size - 3;
    for (const l of lines) {
      this.text(l, LEFT + pad, y, size, true);
      y -= size * 1.4;
    }
    this.y = top - h;
  }

  /** Add the footer (disclaimer, app name, "Page x of y") to every page. */
  finish(): PdfLayout {
    stampPdfFooters(this.pages, { disclaimer: this.copy.disclaimer, pageLabel: this.copy.page, notice: this.notice });
    return { title: this.title, language: this.copy.language, pages: this.pages };
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

  // ---- page 1 ends with the crisis box and the copyright/citation: this is the page the client fills in.
  b.crisisBox();
  b.y -= 6;
  b.paragraph(measure.copyright, { size: 7, color: "muted", lineHeight: 1.3 });
  const loinc = measure.loinc
    ? ` LOINC: panel ${measure.loinc.panel}${measure.loinc.total ? `, total score ${measure.loinc.total}` : ""}.`
    : "";
  b.paragraph(`Citation: ${measure.citation}${loinc}`, { size: 7, color: "muted", lineHeight: 1.3 });

  // ---- clinician page: severity bands and risk-item notes stay off the client's page.
  b.newPage();
  b.paragraph(`${measure.shortName} scoring key (for clinician use)`, { size: 14, bold: true, lineHeight: 1.3 });
  b.paragraph(PDF_CLINICIAN_PAGE_NOTE, { size: 9, color: "muted", lineHeight: 1.3 });
  b.y -= 8;
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

  return b.finish();
}

/* ---------------------------------------------------------------- client handout */

/** Footer notice for a substance-use handout: the exact English sentence, under its Spanish wording on Spanish PDFs. */
function part2Notice(lang: Lang): string {
  return lang === "es" ? `${PDF_PART2_NOTICE_ES}\n${PDF_PART2_NOTICE}` : PDF_PART2_NOTICE;
}

/**
 * Printable client handout in English or Spanish. Spanish uses the handout's own translation and falls back to
 * English when it has none (the layout then is the English one, footer included).
 */
export function handoutPdfLayout(handout: Handout, lang: Lang = "en"): PdfLayout {
  const h = localizeHandout(handout, lang);
  const copy = PDF_COPY[h.lang];
  const extra = HANDOUT_PDF_TEXT[h.lang];
  const tx = (t: { en: string; es?: string }) => (h.lang === "es" && t.es) || t.en;
  const b = new LayoutBuilder(toWinAnsi(h.title), { copy, ...(handout.sud ? { footerNotice: part2Notice(h.lang) } : {}) });
  const body = 11;

  b.paragraph(h.title, { size: 18, bold: true, lineHeight: 1.25 });
  b.y -= 6;
  b.nameLine();
  b.paragraph(withN(tx(HANDOUT_TEXT.minutes), handout.estimatedMinutes), { size: 9.5, color: "muted" });
  b.y -= 4;
  b.paragraph(h.intro, { size: body, lineHeight: 1.45 });
  b.y -= 8;

  for (const section of h.sections) {
    b.heading(section.heading, 13, 2 * body * 1.45);
    if (section.body) b.paragraph(section.body, { size: body, lineHeight: 1.45 });
    if (section.steps && section.steps.length > 0) {
      if (section.body) b.y -= 4;
      b.numbered(section.steps, body);
    }
    b.y -= 8;
  }

  // ---- practice log
  if (h.practiceLog) {
    const cols = h.practiceLog.columns;
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

    b.heading(tx(HANDOUT_TEXT.practiceLog), 13, headH + rowH);
    drawHeader();
    for (let r = 0; r < h.practiceLog.rows; r++) {
      if (b.ensure(rowH)) drawHeader();
      const top = b.y;
      b.rect(LEFT, top - rowH, CONTENT_W, rowH, { stroke: "border", lineWidth: 0.75 });
      for (let i = 1; i < cols.length; i++) b.line(LEFT + i * colW, top, LEFT + i * colW, top - rowH);
      b.y = top - rowH;
    }
    b.y -= 14;
  }

  // ---- safety note + crisis box
  b.heading(tx(HANDOUT_TEXT.safetyNote), 12, 2 * body * 1.45);
  b.paragraph(h.safetyNote, { size: body, lineHeight: 1.45 });
  b.y -= 10;
  b.crisisBox();
  b.y -= 12;

  // ---- sources: client-safe credits only (G3). Titles that name a condition are reduced to the
  // publisher, the same rule the client screen applies, so a printed sheet never names a diagnosis.
  const credits = clientSourceCredits(handout.sources);
  if (credits.length > 0) b.paragraph(`${extra.basedOn} ${credits.join("; ")}.`, { size: 7.5, color: "muted" });
  b.paragraph(extra.questions, { size: 7.5, color: "muted" });
  // Say plainly that a translation has not been checked by a person yet (G10-style honesty for translations).
  if (h.lang === "es" && h.translatedBy?.includes("PENDING")) b.paragraph(HANDOUT_TEXT.machineTranslated.es, { size: 7.5, color: "muted" });

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

export function handoutPdfLines(handout: Handout, lang: Lang = "en"): string[] {
  return layoutPageLines(handoutPdfLayout(handout, lang)).flat();
}

/* ---------------------------------------------------------------- rendering */

/** Draws a layout with pdf-lib, on this device. No creation or modification dates, no author. */
export async function renderPdf(layout: PdfLayout): Promise<Uint8Array> {
  // updateMetadata: false => no automatic creation/modification dates; author is never set.
  const doc = await PDFDocument.create({ updateMetadata: false });
  doc.setTitle(layout.title, { showInWindowTitleBar: true });
  doc.setProducer(PDF_APP_NAME);
  doc.setCreator(PDF_APP_NAME);
  doc.setLanguage(layout.language ?? "en-US");

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
  return renderPdf(measurePdfLayout(measure));
}

/** Printable client handout, in English or (when the handout has a translation) Spanish. */
export function createHandoutPdf(handout: Handout, lang: Lang = "en"): Promise<Uint8Array> {
  return renderPdf(handoutPdfLayout(handout, lang));
}
