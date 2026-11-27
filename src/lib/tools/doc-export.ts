/**
 * PDF (pdf-lib) and Word (docx) rendering of the tools' export outline (./doc-model), entirely on this device.
 * Nothing is uploaded, logged or stored; the caller saves the bytes with src/lib/download.ts. Loaded on demand.
 *
 * - Every PDF page and the Word footer carry the disclaimer, the app name and "Page x of y" (G14).
 * - Substance-use exports (part2) carry the 42 CFR Part 2 notice in a box at the top and in every footer (G6).
 * - `fill` blocks print a blank handwritten line, `write` blocks print ruled lines; nothing personal is filled in (G5).
 * - PDFs carry no creation or modification dates and no author.
 */
import {
  PDF_APP_NAME,
  PDF_CONTENT,
  layoutPageLines,
  pdfFooterNotice,
  renderPdf,
  stampPdfFooters,
  toWinAnsi,
  wrapText,
  type PdfColor,
  type PdfLayout,
  type PdfOp,
  type PdfPageLayout,
} from "@/lib/pdf";
import {
  DOC_CRISIS_HEADING,
  DOC_CRISIS_LINE,
  DOC_FOOTER,
  DOC_PART2_NOTICE,
  docBlocks,
  fillLineText,
  type DocSpec,
} from "./doc-model";
import { withoutDocxDates } from "@/lib/docx-dates";

export const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/* ------------------------------------------------------------------ PDF layout (pure) */

const { top: TOP, left: LEFT, right: RIGHT, width: CONTENT_W } = PDF_CONTENT;
const BODY = 10.5;
const RULE_GAP = 24; // height of one handwriting line

class Layout {
  readonly pages: PdfPageLayout[] = [];
  y = TOP;
  readonly bottom: number;
  private readonly notice: { lines: string[]; bottom: number };

  constructor(footerNotice?: string) {
    this.notice = pdfFooterNotice(footerNotice);
    this.bottom = this.notice.bottom;
    this.newPage();
  }

  private get ops(): PdfOp[] {
    return this.pages[this.pages.length - 1]!.ops;
  }

  newPage() {
    this.pages.push({ ops: [] });
    this.y = TOP;
  }

  /** New page when `h` does not fit (never on an empty page, so a tall block cannot loop). */
  ensure(h: number) {
    if (this.y - h < this.bottom && this.y < TOP) this.newPage();
  }

  gap(h: number) {
    if (this.y < TOP) this.y -= h;
  }

  lines(text: string, o: { size?: number; bold?: boolean; color?: PdfColor; indent?: number; lh?: number; keepWith?: number } = {}) {
    const size = o.size ?? BODY;
    const bold = o.bold ?? false;
    const indent = o.indent ?? 0;
    const lh = size * (o.lh ?? 1.4);
    const wrapped = wrapText(text, size, CONTENT_W - indent, bold);
    if (o.keepWith) this.ensure(lh + o.keepWith);
    for (const l of wrapped) {
      this.ensure(lh);
      this.ops.push({ kind: "text", text: l, x: LEFT + indent, y: this.y - size, size, bold, color: o.color ?? "text" });
      this.y -= lh;
    }
  }

  bullet(text: string) {
    const lh = BODY * 1.4;
    wrapText(text, BODY, CONTENT_W - 14).forEach((l, j) => {
      this.ensure(lh);
      if (j === 0) this.ops.push({ kind: "text", text: toWinAnsi("•"), x: LEFT, y: this.y - BODY, size: BODY, bold: true, color: "text" });
      this.ops.push({ kind: "text", text: l, x: LEFT + 14, y: this.y - BODY, size: BODY, bold: false, color: "text" });
      this.y -= lh;
    });
  }

  /** Ruled lines for handwriting. */
  rules(n: number) {
    for (let i = 0; i < n; i++) {
      this.ensure(RULE_GAP);
      this.y -= RULE_GAP;
      this.ops.push({ kind: "line", x1: LEFT, y1: this.y + 4, x2: RIGHT, y2: this.y + 4, color: "border", lineWidth: 0.75 });
    }
    this.y -= 4;
  }

  box(lines: string[], opts: { heading?: string; size: number }) {
    const pad = 9;
    const headH = opts.heading ? 15 : 0;
    const h = 2 * pad + headH + lines.length * opts.size * 1.4 - 3;
    this.ensure(h + 4);
    const top = this.y;
    this.ops.push({ kind: "rect", x: LEFT, y: top - h, w: CONTENT_W, h, stroke: "crisis", fill: "crisisFill", lineWidth: 1.1 });
    if (opts.heading) this.ops.push({ kind: "text", text: toWinAnsi(opts.heading), x: LEFT + pad, y: top - pad - 10, size: 11, bold: true, color: "crisis" });
    lines.forEach((l, j) => {
      this.ops.push({ kind: "text", text: l, x: LEFT + pad, y: top - pad - headH - opts.size + 1 - j * opts.size * 1.4, size: opts.size, bold: true, color: "text" });
    });
    this.y = top - h - 8;
  }

  finish(title: string): PdfLayout {
    stampPdfFooters(this.pages, { disclaimer: DOC_FOOTER, pageLabel: (i, n) => `Page ${i} of ${n}`, notice: this.notice });
    return { title: toWinAnsi(title), pages: this.pages };
  }
}

/** Pure PDF layout (US Letter). Exported for tests. */
export function docPdfLayout(spec: DocSpec): PdfLayout {
  const b = new Layout(spec.part2 ? DOC_PART2_NOTICE : undefined);
  for (const block of docBlocks(spec)) {
    switch (block.kind) {
      case "title":
        b.lines(block.text, { size: 18, bold: true, lh: 1.25 });
        b.gap(8);
        break;
      case "heading":
        b.gap(8);
        b.lines(block.text, { size: 12.5, bold: true, lh: 1.3, keepWith: 2 * BODY * 1.4 });
        b.gap(2);
        break;
      case "paragraph":
        b.lines(block.text, { bold: block.style === "bold", color: block.style === "muted" ? "muted" : "text" });
        b.gap(4);
        break;
      case "notice":
        b.box(wrapText(block.text, 9.5, CONTENT_W - 18, true), { size: 9.5 });
        break;
      case "list":
        for (const item of block.items) {
          b.bullet(item);
          b.gap(2);
        }
        b.gap(4);
        break;
      case "fill":
        b.ensure(26);
        b.lines(fillLineText(block.label), { size: 11 });
        b.gap(8);
        break;
      case "write":
        b.rules(block.lines);
        break;
      case "crisis":
        b.gap(4);
        b.box(wrapText(DOC_CRISIS_LINE, 10, CONTENT_W - 18, true), { heading: DOC_CRISIS_HEADING, size: 10 });
        break;
    }
  }
  return b.finish(spec.title);
}

/** Text lines per page, in drawing order (footer lines last). */
export function docPdfPageLines(spec: DocSpec): string[][] {
  return layoutPageLines(docPdfLayout(spec));
}

/** The document as a PDF, created on this device. */
export function docPdf(spec: DocSpec): Promise<Uint8Array> {
  return renderPdf(docPdfLayout(spec));
}

/* ------------------------------------------------------------------ Word */

/** The document as a Word file (.docx), created on this device. The docx library loads only when this runs. */
export async function docDocx(spec: DocSpec): Promise<Uint8Array> {
  const { AlignmentType, BorderStyle, Document, Footer, HeadingLevel, Packer, PageNumber, Paragraph, TabStopType, TextRun } =
    await import("docx");
  const box = { style: BorderStyle.SINGLE, size: 8, color: "AD1A1A", space: 4 };
  const boxed = { top: box, bottom: box, left: box, right: box };
  const rule = { style: BorderStyle.SINGLE, size: 6, color: "949BAB", space: 1 };
  const para = (text: string, opts: { bold?: boolean; color?: string; border?: typeof boxed } = {}) =>
    // Line breaks typed in a section become separate paragraphs.
    text.split(/\r?\n/).map(
      (line) =>
        new Paragraph({
          spacing: { after: 100 },
          border: opts.border,
          children: [new TextRun({ text: line, bold: opts.bold, color: opts.color })],
        }),
    );

  const children: InstanceType<typeof Paragraph>[] = [];
  for (const block of docBlocks(spec)) {
    switch (block.kind) {
      case "title":
        children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: block.text, size: 36, bold: true })] }));
        break;
      case "heading":
        children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: block.text })] }));
        break;
      case "paragraph":
        children.push(...para(block.text, { bold: block.style === "bold", color: block.style === "muted" ? "555B6E" : undefined }));
        break;
      case "notice":
        children.push(...para(block.text, { bold: true, border: boxed }));
        break;
      case "list":
        for (const item of block.items) children.push(new Paragraph({ bullet: { level: 0 }, spacing: { after: 60 }, children: [new TextRun({ text: item })] }));
        break;
      case "fill":
        children.push(new Paragraph({ spacing: { before: 120, after: 200 }, children: [new TextRun({ text: fillLineText(block.label), size: 24 })] }));
        break;
      case "write":
        // Empty paragraphs with a bottom border print as ruled lines.
        for (let i = 0; i < block.lines; i++) children.push(new Paragraph({ spacing: { before: 320 }, border: { bottom: rule }, children: [] }));
        break;
      case "crisis":
        children.push(...para(`${DOC_CRISIS_HEADING} ${DOC_CRISIS_LINE}`, { bold: true, border: boxed }));
        break;
    }
  }

  const footer = new Footer({
    children: [
      ...(spec.part2 ? [new Paragraph({ children: [new TextRun({ text: DOC_PART2_NOTICE, bold: true, size: 16 })] })] : []),
      new Paragraph({
        tabStops: [{ type: TabStopType.RIGHT, position: 10080 }],
        children: [
          new TextRun({ text: DOC_FOOTER, bold: true, size: 17 }),
          new TextRun({ text: "\tPage ", size: 17 }),
          new TextRun({ children: [PageNumber.CURRENT], size: 17 }),
          new TextRun({ text: " of ", size: 17 }),
          new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 17 }),
        ],
      }),
      new Paragraph({ alignment: AlignmentType.LEFT, children: [new TextRun({ text: PDF_APP_NAME, size: 15, color: "555B6E" })] }),
    ],
  });

  const doc = new Document({
    title: spec.title,
    description: "Draft created on this device. No identifiers.",
    creator: PDF_APP_NAME,
    lastModifiedBy: PDF_APP_NAME,
    styles: { default: { document: { run: { font: "Calibri", size: 22, language: { value: "en-US" } } } } },
    sections: [
      {
        properties: { page: { margin: { top: 1080, bottom: 1080, left: 1080, right: 1080 } } },
        footers: { default: footer },
        children,
      },
    ],
  });
  return withoutDocxDates(new Uint8Array(await Packer.toArrayBuffer(doc)));
}
