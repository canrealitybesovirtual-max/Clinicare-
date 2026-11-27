/**
 * Treatment plan export (spec screen 4): PDF (pdf-lib) and DOCX (docx), generated entirely on this device.
 * Nothing is uploaded, logged or stored; the caller saves the bytes with src/lib/download.ts.
 *
 * - Both formats render the same pure outline (planOutline), so tests can check content without parsing files.
 * - No identifier fields (G5): the only personal field is a blank, handwritten "Name: ____" line. No dates,
 *   record numbers, contact fields or signatures.
 * - Every page carries the disclaimer footer "Resource only. Not a substitute for clinical judgment." (G14).
 * - Substance-use plans (sud) print the 42 CFR Part 2 notice at the top and in every page footer (G6).
 * - Wording is original (plan library, G2) or written by the clinician with the client; all of it passed the PHI
 *   scrubber before it reached the plan. Labeled "For clinician review"; never states a diagnosis (G3).
 * - Codes are shown as reference codes to confirm through the clinician's own assessment, with a See DSM-5-TR
 *   pointer (G1).
 */
import { PDFDocument, StandardFontEmbedder, StandardFonts, rgb } from "pdf-lib";
import {
  PAGE_HEIGHT,
  PAGE_MARGIN,
  PAGE_WIDTH,
  PDF_APP_NAME,
  PDF_CRISIS_LINE,
  PDF_DISCLAIMER,
  PDF_NAME_LINE,
  PDF_PART2_NOTICE,
  toWinAnsi,
  wrapText,
  type PdfColor,
  type PdfLayout,
  type PdfOp,
  type PdfPageLayout,
} from "./pdf";
import { PLAN_MBC_NOTE, PLAN_PHQ9_NOTE, PLAN_REVIEW_LABEL } from "@/components/plan/plan-wording";

/* ------------------------------------------------------------------ export model */

export interface PlanExportObjective {
  text: string;
  interventions: string[]; // intervention names from the library
}

export interface PlanExportProblem {
  label: string;
  definitions: string[];
  goals: string[];
  objectives: PlanExportObjective[];
}

export interface PlanExport {
  focus: { label: string; icd10cm: string[]; icd11: string[] };
  sud: boolean;
  collaborativeNote: string;
  problems: PlanExportProblem[];
  measures: { name: string; shortName: string; schedule: string }[];
  reviewInterval: string;
  sources: { title: string; publisher: string; year?: number; url: string }[];
  reviewedBy: string;
  lastVerified: string;
}

/* ------------------------------------------------------------------ fixed wording */

export const PLAN_TITLE = "Treatment plan draft";
export const PLAN_FOOTER = PDF_DISCLAIMER; // "Resource only. Not a substitute for clinical judgment."
export const PLAN_PART2_NOTICE = PDF_PART2_NOTICE; // "42 CFR Part 2 prohibits unauthorized use or disclosure of these records."
export const PLAN_NAME_LINE = PDF_NAME_LINE; // the only personal field: blank, filled in by hand
export { PLAN_MBC_NOTE, PLAN_PHQ9_NOTE, PLAN_REVIEW_LABEL };
export const PLAN_PDF_FILENAME = "Treatment plan draft.pdf";
export const PLAN_DOCX_FILENAME = "Treatment plan draft.docx";
export const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function codesLine(focus: PlanExport["focus"]): string {
  const parts: string[] = [];
  if (focus.icd10cm.length) parts.push(`ICD-10-CM ${focus.icd10cm.join(", ")}`);
  if (focus.icd11.length) parts.push(`ICD-11 ${focus.icd11.join(", ")}`);
  const codes = parts.length ? ` Reference codes to confirm through your own assessment: ${parts.join("; ")}.` : "";
  return `Plan library: ${focus.label}.${codes} See DSM-5-TR.`;
}

/* ------------------------------------------------------------------ outline (shared by both formats) */

export interface PlanListItem {
  text: string;
  sub?: string[];
}

export type PlanBlock =
  | { kind: "title"; text: string }
  | { kind: "nameLine"; text: string }
  | { kind: "heading"; level: 2 | 3; text: string }
  | { kind: "paragraph"; text: string; style?: "bold" | "muted" | "notice" }
  | { kind: "list"; ordered: boolean; items: PlanListItem[] };

const none = (text: string): PlanBlock => ({ kind: "paragraph", text, style: "muted" });

/** The plan as an ordered list of blocks. Pure; the same input always gives the same outline. */
export function planOutline(plan: PlanExport): PlanBlock[] {
  const out: PlanBlock[] = [];
  out.push({ kind: "title", text: PLAN_TITLE });
  out.push({ kind: "nameLine", text: PLAN_NAME_LINE });
  if (plan.sud) out.push({ kind: "paragraph", text: PLAN_PART2_NOTICE, style: "notice" });
  out.push({ kind: "paragraph", text: PLAN_REVIEW_LABEL, style: "bold" });
  out.push({ kind: "paragraph", text: codesLine(plan.focus) });

  out.push({ kind: "heading", level: 2, text: "Working with the client" });
  out.push({ kind: "paragraph", text: plan.collaborativeNote });

  if (plan.problems.length === 0) out.push(none("No problems were selected for this plan."));
  plan.problems.forEach((p, i) => {
    out.push({ kind: "heading", level: 2, text: `Problem ${i + 1}: ${p.label}` });
    out.push({ kind: "heading", level: 3, text: "Behavioral definitions" });
    out.push(p.definitions.length ? { kind: "list", ordered: false, items: p.definitions.map((text) => ({ text })) } : none("None selected."));
    out.push({ kind: "heading", level: 3, text: "Long-term goals" });
    out.push(p.goals.length ? { kind: "list", ordered: false, items: p.goals.map((text) => ({ text })) } : none("None selected."));
    out.push({ kind: "heading", level: 3, text: "Short-term objectives" });
    out.push(
      p.objectives.length
        ? {
            kind: "list",
            ordered: true,
            items: p.objectives.map((o) => ({
              text: o.text,
              sub: [o.interventions.length ? `Interventions: ${o.interventions.join("; ")}` : "Interventions: to be chosen"],
            })),
          }
        : none("None selected."),
    );
  });

  out.push({ kind: "heading", level: 2, text: "Measurement-based care" });
  out.push({ kind: "paragraph", text: PLAN_MBC_NOTE });
  out.push(
    plan.measures.length
      ? { kind: "list", ordered: false, items: plan.measures.map((m) => ({ text: `${m.shortName} (${m.name}): ${m.schedule}` })) }
      : none("No measures selected."),
  );
  if (plan.measures.some((m) => m.shortName === "PHQ-9")) out.push({ kind: "paragraph", text: PLAN_PHQ9_NOTE, style: "bold" });

  out.push({ kind: "heading", level: 2, text: "Plan review" });
  out.push({
    kind: "paragraph",
    text: `Review progress and update this plan together with the client: ${plan.reviewInterval.toLowerCase()}, or sooner if things change.`,
  });

  out.push({ kind: "heading", level: 2, text: "Sources and review status" });
  out.push({
    kind: "list",
    ordered: false,
    items: plan.sources.map((s) => ({ text: `${s.title} (${s.publisher}${s.year ? `, ${s.year}` : ""}). ${s.url}` })),
  });
  out.push({
    kind: "paragraph",
    style: "muted",
    text: `Wording: original (app-authored plan library). Clinical review: ${
      plan.reviewedBy === "PENDING" ? "not yet clinically reviewed" : plan.reviewedBy
    }. Last verified: ${plan.lastVerified}.`,
  });
  out.push({ kind: "paragraph", text: `Need help now? ${PDF_CRISIS_LINE}`, style: "bold" });
  return out;
}

/** Every text string in the outline, in order (tests and inspection). */
export function planOutlineText(plan: PlanExport): string[] {
  return planOutline(plan).flatMap((b) =>
    b.kind === "list" ? b.items.flatMap((i) => [i.text, ...(i.sub ?? [])]) : [b.text],
  );
}

/* ------------------------------------------------------------------ PDF layout */

const CONTENT_W = PAGE_WIDTH - 2 * PAGE_MARGIN;
const TOP = PAGE_HEIGHT - PAGE_MARGIN;
const LEFT = PAGE_MARGIN;
const RIGHT = PAGE_WIDTH - PAGE_MARGIN;
const FOOTER_H = 30;
const BASE_BOTTOM = PAGE_MARGIN + FOOTER_H;
const NOTICE_SIZE = 7.5;
const NOTICE_LH = 9.5;
const BODY = 10;

type FontName = Parameters<typeof StandardFontEmbedder.for>[0];
let regularMetrics: StandardFontEmbedder | null = null;
function textWidth(text: string, size: number): number {
  regularMetrics ??= StandardFontEmbedder.for(StandardFonts.Helvetica as unknown as FontName);
  return regularMetrics.widthOfTextAtSize(text, size);
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

class PlanLayout {
  readonly pages: PdfPageLayout[] = [];
  y = TOP;
  readonly bottom: number;
  private readonly noticeLines: string[];

  constructor(
    readonly title: string,
    footerNotice?: string,
  ) {
    this.noticeLines = footerNotice ? wrapText(footerNotice, NOTICE_SIZE, CONTENT_W, true) : [];
    this.bottom = BASE_BOTTOM + (this.noticeLines.length ? this.noticeLines.length * NOTICE_LH + 6 : 0);
    this.newPage();
  }

  private get ops(): PdfOp[] {
    return this.pages[this.pages.length - 1]!.ops;
  }

  newPage() {
    this.pages.push({ ops: [] });
    this.y = TOP;
  }

  ensure(h: number) {
    if (this.y - h < this.bottom && this.y < TOP) this.newPage();
  }

  lines(text: string, opts: { size?: number; bold?: boolean; color?: PdfColor; indent?: number; lh?: number; keepWith?: number } = {}) {
    const size = opts.size ?? BODY;
    const bold = opts.bold ?? false;
    const indent = opts.indent ?? 0;
    const lh = size * (opts.lh ?? 1.4);
    const wrapped = wrapText(text, size, CONTENT_W - indent, bold);
    if (opts.keepWith) this.ensure(lh + opts.keepWith);
    for (const l of wrapped) {
      this.ensure(lh);
      this.ops.push({ kind: "text", text: l, x: LEFT + indent, y: this.y - size, size, bold, color: opts.color ?? "text" });
      this.y -= lh;
    }
  }

  marker(text: string, x: number, size: number) {
    // Drawn on the line that was just started (y already moved down by one line).
    this.ops.push({ kind: "text", text: toWinAnsi(text), x, y: this.y - size, size, bold: true, color: "text" });
  }

  listItem(marker: string, text: string, indent: number, size = BODY) {
    const lh = size * 1.4;
    const wrapped = wrapText(text, size, CONTENT_W - indent - 14, false);
    wrapped.forEach((l, j) => {
      this.ensure(lh);
      if (j === 0) this.marker(marker, LEFT + indent, size);
      this.ops.push({ kind: "text", text: l, x: LEFT + indent + 14, y: this.y - size, size, bold: false, color: "text" });
      this.y -= lh;
    });
  }

  noticeBox(text: string) {
    const pad = 7;
    const size = 9.5;
    const lines = wrapText(text, size, CONTENT_W - 2 * pad, true);
    const h = 2 * pad + lines.length * size * 1.35 - 2;
    this.ensure(h + 4);
    const top = this.y;
    this.ops.push({ kind: "rect", x: LEFT, y: top - h, w: CONTENT_W, h, stroke: "crisis", fill: "crisisFill", lineWidth: 1 });
    lines.forEach((l, j) => {
      this.ops.push({ kind: "text", text: l, x: LEFT + pad, y: top - pad - size + 1 - j * size * 1.35, size, bold: true, color: "text" });
    });
    this.y = top - h - 6;
  }

  gap(h: number) {
    if (this.y < TOP) this.y -= h;
  }

  finish(): PdfLayout {
    const n = this.pages.length;
    this.pages.forEach((page, i) => {
      this.noticeLines.forEach((l, j) => {
        page.ops.push({ kind: "text", text: l, x: LEFT, y: this.bottom - 4 - NOTICE_SIZE - j * NOTICE_LH, size: NOTICE_SIZE, bold: true, color: "text" });
      });
      const sep = BASE_BOTTOM - 8;
      page.ops.push({ kind: "line", x1: LEFT, y1: sep, x2: RIGHT, y2: sep, color: "border", lineWidth: 0.5 });
      page.ops.push({ kind: "text", text: PLAN_FOOTER, x: LEFT, y: sep - 11, size: 8.5, bold: true, color: "text" });
      const label = `Page ${i + 1} of ${n}`;
      page.ops.push({ kind: "text", text: label, x: RIGHT - textWidth(label, 8.5), y: sep - 11, size: 8.5, bold: false, color: "text" });
      page.ops.push({ kind: "text", text: PDF_APP_NAME, x: LEFT, y: sep - 21, size: 7.5, bold: false, color: "muted" });
    });
    return { title: this.title, pages: this.pages };
  }
}

/** Pure PDF layout for a plan (US Letter). Exported for tests. */
export function planPdfLayout(plan: PlanExport): PdfLayout {
  const b = new PlanLayout(PLAN_TITLE, plan.sud ? PLAN_PART2_NOTICE : undefined);
  for (const block of planOutline(plan)) {
    switch (block.kind) {
      case "title":
        b.lines(block.text, { size: 18, bold: true, lh: 1.25 });
        b.gap(6);
        break;
      case "nameLine":
        b.ensure(26);
        b.lines(block.text, { size: 11 });
        b.gap(8);
        break;
      case "heading":
        b.gap(block.level === 2 ? 8 : 4);
        b.lines(block.text, { size: block.level === 2 ? 13 : 10.5, bold: true, lh: 1.3, keepWith: 2 * BODY * 1.4 });
        b.gap(2);
        break;
      case "paragraph":
        if (block.style === "notice") {
          b.noticeBox(block.text);
        } else {
          b.lines(block.text, { bold: block.style === "bold", color: block.style === "muted" ? "muted" : "text" });
          b.gap(4);
        }
        break;
      case "list":
        block.items.forEach((item, i) => {
          b.listItem(block.ordered ? `${i + 1}.` : "•", item.text, 0);
          for (const s of item.sub ?? []) b.listItem("–", s, 16, 9.5);
          b.gap(2);
        });
        b.gap(4);
        break;
    }
  }
  return b.finish();
}

/** Text lines per page, in drawing order (footer lines last). */
export function planPdfPageLines(plan: PlanExport): string[][] {
  return planPdfLayout(plan).pages.map((p) => p.ops.flatMap((op) => (op.kind === "text" ? [op.text] : [])));
}

/** Plan as a PDF (US Letter), created on this device. */
export async function planPdf(plan: PlanExport): Promise<Uint8Array> {
  const layout = planPdfLayout(plan);
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
        page.drawLine({ start: { x: op.x1, y: op.y1 }, end: { x: op.x2, y: op.y2 }, thickness: op.lineWidth, color: color(op.color) });
      }
    }
  }
  return doc.save();
}

/* ------------------------------------------------------------------ DOCX */

/** Plan as a Word document (.docx), created on this device. The docx library loads only when this runs. */
export async function planDocx(plan: PlanExport): Promise<Uint8Array> {
  const d = await import("docx");
  const { AlignmentType, BorderStyle, Document, Footer, HeadingLevel, Packer, PageNumber, Paragraph, TabStopType, TextRun } = d;

  const children: InstanceType<typeof Paragraph>[] = [];
  for (const block of planOutline(plan)) {
    switch (block.kind) {
      case "title":
        children.push(new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun({ text: block.text })] }));
        break;
      case "nameLine":
        children.push(new Paragraph({ spacing: { before: 120, after: 240 }, children: [new TextRun({ text: block.text, size: 24 })] }));
        break;
      case "heading":
        children.push(
          new Paragraph({
            heading: block.level === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3,
            children: [new TextRun({ text: block.text })],
          }),
        );
        break;
      case "paragraph":
        children.push(
          new Paragraph({
            spacing: { after: 120 },
            border:
              block.style === "notice"
                ? {
                    top: { style: BorderStyle.SINGLE, size: 8, color: "AD1A1A", space: 4 },
                    bottom: { style: BorderStyle.SINGLE, size: 8, color: "AD1A1A", space: 4 },
                    left: { style: BorderStyle.SINGLE, size: 8, color: "AD1A1A", space: 4 },
                    right: { style: BorderStyle.SINGLE, size: 8, color: "AD1A1A", space: 4 },
                  }
                : undefined,
            children: [
              new TextRun({
                text: block.text,
                bold: block.style === "bold" || block.style === "notice",
                color: block.style === "muted" ? "555B6E" : undefined,
              }),
            ],
          }),
        );
        break;
      case "list":
        block.items.forEach((item, i) => {
          children.push(
            block.ordered
              ? new Paragraph({
                  indent: { left: 360, hanging: 360 },
                  spacing: { after: 60 },
                  children: [new TextRun({ text: `${i + 1}.\t`, bold: true }), new TextRun({ text: item.text })],
                })
              : new Paragraph({ bullet: { level: 0 }, spacing: { after: 60 }, children: [new TextRun({ text: item.text })] }),
          );
          for (const s of item.sub ?? []) {
            children.push(new Paragraph({ bullet: { level: 1 }, spacing: { after: 60 }, children: [new TextRun({ text: s, size: 20 })] }));
          }
        });
        break;
    }
  }

  const footerParagraphs = [
    ...(plan.sud ? [new Paragraph({ children: [new TextRun({ text: PLAN_PART2_NOTICE, bold: true, size: 16 })] })] : []),
    new Paragraph({
      children: [
        new TextRun({ text: PLAN_FOOTER, bold: true, size: 17 }),
        new TextRun({ text: "\tPage ", size: 17 }),
        new TextRun({ children: [PageNumber.CURRENT], size: 17 }),
        new TextRun({ text: " of ", size: 17 }),
        new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 17 }),
      ],
      tabStops: [{ type: TabStopType.RIGHT, position: 10080 }],
    }),
    new Paragraph({ alignment: AlignmentType.LEFT, children: [new TextRun({ text: PDF_APP_NAME, size: 15, color: "555B6E" })] }),
  ];

  const doc = new Document({
    title: PLAN_TITLE,
    description: "Treatment plan draft for clinician review. No identifiers.",
    creator: PDF_APP_NAME,
    lastModifiedBy: PDF_APP_NAME,
    styles: { default: { document: { run: { font: "Calibri", size: 21 } } } },
    sections: [
      {
        properties: { page: { margin: { top: 1080, bottom: 1080, left: 1080, right: 1080 } } },
        footers: { default: new Footer({ children: footerParagraphs }) },
        children,
      },
    ],
  });
  return new Uint8Array(await Packer.toArrayBuffer(doc));
}
