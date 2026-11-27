/**
 * Formulation worksheet (/formulations/builder): templates built from the worksheet frameworks, the memory-only
 * draft, linked-intervention suggestions and the export outline. Pure: no React, no I/O.
 *
 * - Templates come from content (content/formulations, worksheet: true); chips are the curated factors of the
 *   transdiagnostic process map and the behavior functions of the functional analysis.
 * - The session prefill is read-only and uses curated wording only: documented symptom labels from the lexicon and
 *   measure totals with their published bands. Typed session text is never copied in.
 * - Never states a diagnosis (G3) and never grades or decides risk (G9). Suggestions are links from the chips the
 *   clinician tapped to library interventions, listed for clinician review with what they are linked to.
 * - No identifiers (G5): the export has one blank, handwritten "Client: ____" line; every typed note passed the PHI
 *   scrubber in the field and is scrubbed again here.
 * - Substance use (G6): ticked by the clinician, named in a note, or carried by a prefilled symptom, the export
 *   carries the 42 CFR Part 2 notice.
 */
import { scrubPHI } from "@/lib/phi-scrubber";
import { mentionsSubstanceUse } from "@/lib/substance-terms";
import { measureLine, type NoteMeasure } from "@/lib/notes/note";
import type { DocBlock, DocSpec } from "@/lib/tools/doc-model";
import {
  DOMAIN_LABELS,
  FORMULATION_DOMAINS,
  type BehaviorFunction,
  type Formulation,
  type FormulationDomain,
  type FormulationFactor,
} from "@/lib/schemas-formulations";

/* ------------------------------------------------------------------ templates and chips */

export interface WorksheetPart {
  id: string;
  label: string;
  prompt: string;
  /** One short example shown under the prompt. */
  example: string | null;
  factorIds: string[];
  groupByDomain: boolean;
  prefill: boolean;
  functionChips: boolean;
  text: boolean;
}

export interface WorksheetTemplate {
  id: string;
  name: string;
  shortName: string;
  parts: WorksheetPart[];
  /** Publishers of the framework's sources, for the export's attribution line. */
  basedOn: string;
}

export interface WorksheetChip {
  id: string;
  /** Clinician wording, shown on screen. */
  label: string;
  /** Plain wording, printed on the shareable copy. */
  plainLabel: string;
  /** Column on the 5 Ps grid (the factor's first domain); null for behavior functions. */
  domain: FormulationDomain | null;
  interventionIds: string[];
}

export interface WorksheetLibrary {
  factors: Record<string, WorksheetChip>;
  functions: Record<string, WorksheetChip>;
  /** Intervention id -> name, for the interventions that exist in the library. */
  interventionNames: Record<string, string>;
}

export function toWorksheetTemplate(f: Formulation): WorksheetTemplate {
  return {
    id: f.id,
    name: f.name,
    shortName: f.shortName,
    parts: f.structure.map((s) => ({
      id: s.id,
      label: s.label,
      prompt: s.prompt,
      example: s.examples[0] ?? null,
      factorIds: s.factorIds ?? [],
      groupByDomain: s.groupByDomain === true,
      prefill: s.prefill === "session",
      functionChips: s.functionChips === true,
      text: s.text !== false,
    })),
    basedOn: [...new Set(f.sources.map((s) => s.publisher))].join("; "),
  };
}

export function worksheetLibrary(
  factors: readonly FormulationFactor[],
  functions: readonly BehaviorFunction[],
  interventionNames: Readonly<Record<string, string>>,
): WorksheetLibrary {
  const chip = (x: FormulationFactor | BehaviorFunction, domain: FormulationDomain | null): WorksheetChip => ({
    id: x.id,
    label: x.label,
    plainLabel: x.plainLabel,
    domain,
    interventionIds: x.interventionIds.filter((id) => id in interventionNames),
  });
  return {
    factors: Object.fromEntries(factors.map((f) => [f.id, chip(f, f.domains[0] ?? null)])),
    functions: Object.fromEntries(functions.map((f) => [f.id, chip(f, null)])),
    interventionNames: { ...interventionNames },
  };
}

/** A factor or behavior-function chip by id (the two id sets do not overlap). */
export function chipOf(lib: WorksheetLibrary, id: string): WorksheetChip | undefined {
  return lib.factors[id] ?? lib.functions[id];
}

/** A part's factor chips grouped under the four domain headings, in grid order (empty domains left out). */
export function chipsByDomain(chips: readonly WorksheetChip[]): { domain: FormulationDomain; label: string; chips: WorksheetChip[] }[] {
  return FORMULATION_DOMAINS.map((domain) => ({ domain, label: DOMAIN_LABELS[domain], chips: chips.filter((c) => c.domain === domain) })).filter(
    (g) => g.chips.length > 0,
  );
}

/* ------------------------------------------------------------------ session prefill (read-only) */

export interface PrefillItem {
  id: string;
  text: string;
  /** A substance-use symptom (G6). */
  sud: boolean;
}

type Labeled = { id: string; label: string };

/**
 * Documented symptoms (lexicon labels), cultural concepts of distress the client named (shown, never scored) and
 * answered measures (published bands), as curated wording.
 */
export function sessionPrefill(
  session: { symptoms: readonly Labeled[]; cultural: readonly Labeled[]; measures: readonly NoteMeasure[] },
  sudSymptomIds: ReadonlySet<string>,
): PrefillItem[] {
  return [
    ...session.symptoms.map((s) => ({ id: `symptom:${s.id}`, text: s.label, sud: sudSymptomIds.has(s.id) })),
    ...session.cultural.map((s) => ({ id: `cultural:${s.id}`, text: `${s.label} (named by the client; explore what it means to them)`, sud: false })),
    ...session.measures.map((m) => ({ id: `measure:${m.shortName}`, text: measureLine(m), sud: false })),
  ];
}

/* ------------------------------------------------------------------ draft (memory only) */

export interface PartDraft {
  /** Selected factor or function chip ids. */
  chips: string[];
  /** Scrubbed notes. */
  text: string;
  /** Prefill items the clinician left out. */
  excluded: string[];
}

export interface WorksheetDraft {
  parts: Record<string, PartDraft>;
  /** The clinician ticked "substance use is part of this formulation". */
  substanceUse: boolean;
}

export const EMPTY_DRAFT: WorksheetDraft = { parts: {}, substanceUse: false };
const EMPTY_PART: PartDraft = { chips: [], text: "", excluded: [] };

export function partDraft(draft: WorksheetDraft, partId: string): PartDraft {
  return draft.parts[partId] ?? EMPTY_PART;
}

function withPart(draft: WorksheetDraft, partId: string, fn: (p: PartDraft) => PartDraft): WorksheetDraft {
  return { ...draft, parts: { ...draft.parts, [partId]: fn(partDraft(draft, partId)) } };
}

const toggle = (list: readonly string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

export const toggleChip = (draft: WorksheetDraft, partId: string, chipId: string) =>
  withPart(draft, partId, (p) => ({ ...p, chips: toggle(p.chips, chipId) }));
export const togglePrefill = (draft: WorksheetDraft, partId: string, itemId: string) =>
  withPart(draft, partId, (p) => ({ ...p, excluded: toggle(p.excluded, itemId) }));
export const setPartText = (draft: WorksheetDraft, partId: string, text: string) => withPart(draft, partId, (p) => ({ ...p, text }));

/** Prefill items still included in a part. */
export function includedPrefill(prefill: readonly PrefillItem[], part: PartDraft): PrefillItem[] {
  return prefill.filter((i) => !part.excluded.includes(i.id));
}

/** True when the clinician has chosen or written anything that clearing would discard. */
export function hasWork(draft: WorksheetDraft): boolean {
  return draft.substanceUse || Object.values(draft.parts).some((p) => p.chips.length > 0 || p.text.trim() !== "" || p.excluded.length > 0);
}

/** G6: ticked, named in a note, or carried by an included prefilled symptom. */
export function worksheetRecordsSubstanceUse(template: WorksheetTemplate, draft: WorksheetDraft, prefill: readonly PrefillItem[]): boolean {
  if (draft.substanceUse) return true;
  return template.parts.some((part) => {
    const p = partDraft(draft, part.id);
    if (part.text && mentionsSubstanceUse(p.text)) return true;
    return part.prefill && includedPrefill(prefill, p).some((i) => i.sud);
  });
}

/* ------------------------------------------------------------------ linked interventions (for clinician review) */

export interface InterventionSuggestion {
  id: string;
  name: string;
  /** Selected chips this intervention is linked to (the reason it is listed). */
  linked: WorksheetChip[];
  /** Other curated factors or functions it also works on, not selected here. */
  alsoTargets: WorksheetChip[];
}

/** Selected chips of a template that exist in the library, in part order, without repeats. */
export function selectedChips(template: WorksheetTemplate, draft: WorksheetDraft, lib: WorksheetLibrary): WorksheetChip[] {
  const out = new Map<string, WorksheetChip>();
  for (const part of template.parts)
    for (const id of partDraft(draft, part.id).chips) {
      const chip = chipOf(lib, id);
      if (chip && !out.has(chip.id)) out.set(chip.id, chip);
    }
  return [...out.values()];
}

/**
 * Library interventions linked to the selected chips, most links first, then by name. A deterministic list of links,
 * not a ranking of what will work: the clinician chooses within training, evidence and the person's preferences.
 */
export function suggestInterventions(template: WorksheetTemplate, draft: WorksheetDraft, lib: WorksheetLibrary): InterventionSuggestion[] {
  const selected = selectedChips(template, draft, lib);
  const selectedIds = new Set(selected.map((c) => c.id));
  const allChips = [...Object.values(lib.factors), ...Object.values(lib.functions)];
  const linkedBy = new Map<string, WorksheetChip[]>();
  for (const chip of selected)
    for (const iid of chip.interventionIds) linkedBy.set(iid, [...(linkedBy.get(iid) ?? []), chip]);
  return [...linkedBy.entries()]
    .map(([id, linked]) => ({
      id,
      name: lib.interventionNames[id] ?? id,
      linked,
      alsoTargets: allChips.filter((c) => !selectedIds.has(c.id) && c.interventionIds.includes(id)),
    }))
    .sort((a, b) => b.linked.length - a.linked.length || a.name.localeCompare(b.name));
}

/* ------------------------------------------------------------------ export */

export const WORKSHEET_REVIEW_LINE =
  "For clinician review. A shared, working explanation to revise together. It is not a diagnosis and it does not assess risk.";
const WORKSHEET_SUGGESTIONS_HEADING = "Possible interventions to discuss (for clinician review)";

export function worksheetTitle(template: WorksheetTemplate): string {
  return `Formulation worksheet (${template.shortName})`;
}

const scrubbedLines = (text: string) =>
  scrubPHI(text.trim())
    .clean.split(/\r?\n/)
    .map((l) => l.replace(/^[-*•]\s*/, "").trim())
    .filter(Boolean);

/**
 * The worksheet as an export outline: plain wording for chips (safe to share), included prefill, scrubbed notes and
 * ruled lines where a part is empty. Ends with the linked interventions, attribution and the crisis box.
 */
export function worksheetDoc(
  template: WorksheetTemplate,
  draft: WorksheetDraft,
  lib: WorksheetLibrary,
  prefill: readonly PrefillItem[],
): DocSpec {
  const title = worksheetTitle(template);
  const blocks: DocBlock[] = [
    { kind: "title", text: title },
    { kind: "fill", label: "Client" },
    { kind: "paragraph", text: WORKSHEET_REVIEW_LINE, style: "bold" },
    { kind: "paragraph", text: `Framework: ${template.name}` },
  ];
  for (const part of template.parts) {
    const p = partDraft(draft, part.id);
    blocks.push({ kind: "heading", text: part.label });
    blocks.push({ kind: "paragraph", text: part.prompt, style: "muted" });
    const items: string[] = [];
    if (part.prefill) items.push(...includedPrefill(prefill, p).map((i) => i.text));
    const chips = p.chips.flatMap((id) => chipOf(lib, id) ?? []);
    if (part.groupByDomain)
      items.push(...chipsByDomain(chips).map((g) => `${g.label}: ${g.chips.map((c) => c.plainLabel).join("; ")}`));
    else items.push(...chips.map((c) => c.plainLabel));
    if (part.text) items.push(...scrubbedLines(p.text));
    if (items.length) blocks.push({ kind: "list", items });
    else blocks.push({ kind: "write", lines: 2 });
  }
  const suggestions = suggestInterventions(template, draft, lib);
  if (suggestions.length) {
    blocks.push({ kind: "heading", text: WORKSHEET_SUGGESTIONS_HEADING });
    blocks.push({
      kind: "list",
      items: suggestions.map((s) => `${s.name}: linked to ${s.linked.map((c) => c.plainLabel.toLowerCase()).join("; ")}`),
    });
  }
  blocks.push({
    kind: "paragraph",
    style: "muted",
    text: `Framework summarized in this resource's own words, based on: ${template.basedOn}.`,
  });
  blocks.push({ kind: "crisis" });
  return { title, blocks, part2: worksheetRecordsSubstanceUse(template, draft, prefill) };
}
