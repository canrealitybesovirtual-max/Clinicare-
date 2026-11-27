/**
 * Export outline shared by the in-session tools (session note, safety plan, referral letter), and its plain-text
 * form for the clipboard. Light on purpose (no pdf-lib or docx): screens import it directly, so "Copy" runs inside
 * the click itself; PDF and Word rendering (./doc-export) load only when asked for.
 *
 * - The outline holds only wording that already passed the PHI scrubber, or the app's own wording.
 * - Personal details are never typed: `fill` blocks print a blank, handwritten line ("Client: ____") and `write`
 *   blocks print empty ruled lines (G5).
 * - `part2: true` (substance-use content) puts the 42 CFR Part 2 notice at the top and in every footer (G6).
 */
import { PART2_NOTICE } from "@/lib/referral-links";

export type DocBlock =
  | { kind: "title"; text: string }
  | { kind: "heading"; text: string }
  | { kind: "paragraph"; text: string; style?: "bold" | "muted" }
  | { kind: "list"; items: string[] }
  /** A boxed notice (the 42 CFR Part 2 notice at the top of a substance-use export). */
  | { kind: "notice"; text: string }
  /** A blank line to fill in by hand: "Label: ________". */
  | { kind: "fill"; label: string }
  /** Empty ruled lines for handwriting. */
  | { kind: "write"; lines: number }
  /** The crisis box: 988, local emergency number, findahelpline.com (G9). */
  | { kind: "crisis" };

export interface DocSpec {
  title: string;
  blocks: DocBlock[];
  /** Substance-use content: Part 2 notice at the top and in every footer (G6). */
  part2: boolean;
}

/** Same wording as the PDF footer and crisis box in src/lib/pdf.ts (a test keeps them equal). */
export const DOC_FOOTER = "Resource only. Not a substitute for clinical judgment.";
export const DOC_CRISIS_HEADING = "Need help now?";
export const DOC_CRISIS_LINE = "US: call or text 988 · Emergency: 911 or your local number · Other countries: findahelpline.com";
export const DOC_PART2_NOTICE = PART2_NOTICE;

const FILL_RULE = "________________________________________";

export function fillLineText(label: string): string {
  return `${label}: ${FILL_RULE}`;
}

/** The outline with the Part 2 box placed right after the title when the document needs it. */
export function docBlocks(spec: DocSpec): DocBlock[] {
  if (!spec.part2) return spec.blocks;
  const i = spec.blocks.findIndex((b) => b.kind === "title");
  const notice: DocBlock = { kind: "notice", text: DOC_PART2_NOTICE };
  return [...spec.blocks.slice(0, i + 1), notice, ...spec.blocks.slice(i + 1)];
}

/** The document as plain text, for pasting into a record system. Ends with the disclaimer (and Part 2 notice). */
export function docPlainText(spec: DocSpec): string {
  const out: string[] = [];
  for (const b of docBlocks(spec)) {
    switch (b.kind) {
      case "title":
        out.push(b.text.toUpperCase());
        break;
      case "heading":
        out.push("", b.text);
        break;
      case "paragraph":
      case "notice":
        out.push(b.text);
        break;
      case "list":
        out.push(...b.items.map((i) => `- ${i}`));
        break;
      case "fill":
        out.push(fillLineText(b.label));
        break;
      case "write":
        out.push(...Array.from({ length: b.lines }, () => FILL_RULE));
        break;
      case "crisis":
        out.push(`${DOC_CRISIS_HEADING} ${DOC_CRISIS_LINE}`);
        break;
    }
  }
  out.push("", DOC_FOOTER);
  if (spec.part2) out.push(DOC_PART2_NOTICE);
  return out.join("\n");
}

/** File name for an export of this document. */
export function docFilename(spec: DocSpec, ext: "pdf" | "docx"): string {
  return `${spec.title}.${ext}`;
}
