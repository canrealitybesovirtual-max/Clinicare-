/**
 * Offline FHIR R4 export of a scored measure (Phase 4: LOINC-coded measures + FHIR QuestionnaireResponse
 * with no identifiers; docs/SPEC.md 11.1, docs/RESOURCES.md "LOINC" and "HL7 FHIR Questionnaire").
 *
 * Pure and offline: no network, no storage, no logging. The result is a plain JSON object the caller
 * turns into a download (see questionnaireResponseBytes + src/lib/download.ts). Nothing leaves the device.
 *
 * Zero identifiers by construction (G5):
 * - no subject, author, source, encounter, basedOn, partOf, contained, id, identifier, meta.source;
 * - no narrative (resource-level `text`); the only human-readable strings are the measure's own
 *   item text, option labels and LOINC displays, never anything the clinician typed;
 * - `authored` is omitted by default. A date is an identifier element under Safe Harbor once it can be
 *   combined with other data, so it is only written (as YYYY-MM-DD, no time, no zone) when the caller
 *   opts in with { authoredDate: true };
 * - every result is passed through validateNoIdentifiers before it is returned.
 *
 * Coding (verified 2026-11-26 against NLM's LOINC form definitions service,
 * https://clinicaltables.nlm.nih.gov/loinc_form_definitions?loinc_num=69737-5 and ...=44249-1):
 * - questionnaire canonical: http://loinc.org/q/<panel> (GAD-7 69737-5, PHQ-9 44249-1);
 * - frequency answers use LOINC answer list LL358-3: LA6568-5 "Not at all" (0), LA6569-3 "Several days" (1),
 *   LA6570-1 "More than half the days" (2), LA6571-9 "Nearly every day" (3);
 * - each answer Coding carries its score in the R4 core `ordinalValue` extension (valueDecimal, context
 *   Coding) and the answer carries the same score in `itemWeight` (the SDC / extensions-pack successor),
 *   so both R4-core and SDC consumers can sum it;
 * - the total score item (GAD-7 70274-6, PHQ-9 44261-6) is LOINC data type REAL with unit {score}, so it is
 *   a valueQuantity in UCUM {score}. It is written only when every item is answered: a partial sum is not
 *   the measure's total and could be misread as a low score;
 * - the functional-difficulty question (69722-7; LA6572-7, LA6573-5, LA6575-0, LA6574-3) is part of the
 *   LOINC PHQ-9 panel only. It is unscored and exported only when the caller passes opts.functional.
 *
 * Clinician mode only: the export contains item answers and a total score, which must not be shown or
 * offered in client mode (G3). It states no diagnosis, no severity band and no risk decision (G9); PHQ-9
 * item 9 is exported exactly as answered, like every other item.
 */
import { scoreMeasure } from "./measures";
import { containsPHI } from "./phi-scrubber";
import type { Measure } from "./schemas";

export const FHIR_JSON_MIME = "application/fhir+json";
export const LOINC_SYSTEM = "http://loinc.org";
export const UCUM_SYSTEM = "http://unitsofmeasure.org";
/** R4 core extension (context Coding, value decimal). */
export const ORDINAL_VALUE_URL = "http://hl7.org/fhir/StructureDefinition/ordinalValue";
/** SDC / FHIR extensions pack successor of ordinalValue (context includes QuestionnaireResponse.item.answer). */
export const ITEM_WEIGHT_URL = "http://hl7.org/fhir/StructureDefinition/itemWeight";
/** Display text for a canonical reference (SDC questionnaireDisplay slice). */
export const DISPLAY_URL = "http://hl7.org/fhir/StructureDefinition/display";

/** LOINC's required notice for products that include LOINC content. Show it next to the export button. */
export const LOINC_NOTICE =
  "This material contains content from LOINC (http://loinc.org). LOINC is copyright © Regenstrief Institute, Inc. " +
  "and the Logical Observation Identifiers Names and Codes (LOINC) Committee and is available at no cost under the " +
  "license at http://loinc.org/license. LOINC® is a registered United States trademark of Regenstrief Institute, Inc.";

export interface LoincAnswer {
  code: string;
  display: string;
  /** Option value (score) this answer stands for; null for unscored answers (functional difficulty). */
  score: number | null;
}

/** LOINC answer list LL358-3 (PHQ frequency scale). */
export const LOINC_FREQUENCY_ANSWERS: readonly LoincAnswer[] = [
  { code: "LA6568-5", display: "Not at all", score: 0 },
  { code: "LA6569-3", display: "Several days", score: 1 },
  { code: "LA6570-1", display: "More than half the days", score: 2 },
  { code: "LA6571-9", display: "Nearly every day", score: 3 },
];

/** Answers for LOINC 69722-7 (functional difficulty), in questionnaire order. Unscored. */
export const LOINC_DIFFICULTY_ANSWERS: readonly LoincAnswer[] = [
  { code: "LA6572-7", display: "Not difficult at all", score: null },
  { code: "LA6573-5", display: "Somewhat difficult", score: null },
  { code: "LA6575-0", display: "Very difficult", score: null },
  { code: "LA6574-3", display: "Extremely difficult", score: null },
];

export interface LoincPanel {
  panel: string;
  /** measure item id -> LOINC question code */
  items: Readonly<Record<string, string>>;
  total: string;
  answers: readonly LoincAnswer[];
  /** LOINC code of the functional-difficulty question when it belongs to this panel. */
  functional?: { code: string; answers: readonly LoincAnswer[] };
}

/** Panels this app can export, keyed by LOINC panel code. */
export const LOINC_PANELS: Readonly<Record<string, LoincPanel>> = {
  "69737-5": {
    panel: "69737-5",
    items: {
      "1": "69725-0",
      "2": "68509-9",
      "3": "69733-4",
      "4": "69734-2",
      "5": "69735-9",
      "6": "69689-8",
      "7": "69736-7",
    },
    total: "70274-6",
    answers: LOINC_FREQUENCY_ANSWERS,
  },
  "44249-1": {
    panel: "44249-1",
    items: {
      "1": "44250-9",
      "2": "44255-8",
      "3": "44259-0",
      "4": "44254-1",
      "5": "44251-7",
      "6": "44258-2",
      "7": "44252-5",
      "8": "44253-3",
      "9": "44260-8",
    },
    total: "44261-6",
    answers: LOINC_FREQUENCY_ANSWERS,
    functional: { code: "69722-7", answers: LOINC_DIFFICULTY_ANSWERS },
  },
};

// ---- Resource types (the subset this module writes) -------------------------------------------------

export interface FhirExtension {
  url: string;
  valueDecimal?: number;
  valueString?: string;
}

export interface FhirCoding {
  system?: string;
  code?: string;
  display?: string;
  extension?: FhirExtension[];
}

export interface FhirQuantity {
  value: number;
  unit: string;
  system: string;
  code: string;
}

export interface QuestionnaireResponseAnswer {
  extension?: FhirExtension[];
  valueCoding?: FhirCoding;
  valueInteger?: number;
  valueQuantity?: FhirQuantity;
}

export interface QuestionnaireResponseItem {
  linkId: string;
  text?: string;
  answer?: QuestionnaireResponseAnswer[];
}

export interface QuestionnaireResponse {
  resourceType: "QuestionnaireResponse";
  language: "en";
  questionnaire: string;
  _questionnaire?: { extension: FhirExtension[] };
  status: "completed" | "in-progress";
  /** YYYY-MM-DD only, and only when opts.authoredDate is true. */
  authored?: string;
  /** Omitted when nothing is answered (FHIR JSON forbids empty arrays). */
  item?: QuestionnaireResponseItem[];
}

export interface FhirExportOptions {
  /** Write `authored` as the local calendar date (YYYY-MM-DD). Default false: dates are identifiers. */
  authoredDate?: boolean;
  /** Clock for `authored` (tests). Defaults to the current time. */
  now?: Date;
  /**
   * linkId style. "item" (default): the measure's own item ids ("1".."9"). "loinc": the item's LOINC
   * question code (for example "69725-0"), as some implementation guides do. Match whatever the
   * receiving system's Questionnaire uses. The total and difficulty items always use their LOINC code.
   */
  linkIds?: "item" | "loinc";
  /**
   * Index (0-based) into measure.functionalItem.options, or null/undefined when not answered. Exported
   * only when the LOINC panel contains the difficulty question (PHQ-9); see describeFhirExport.
   */
  functional?: number | null;
}

export class FhirExportUnavailable extends Error {
  constructor(reason: string) {
    super(`FHIR export unavailable: ${reason}`);
    this.name = "FhirExportUnavailable";
  }
}

export class FhirIdentifierError extends Error {
  readonly problems: string[];
  constructor(problems: string[]) {
    super(`FHIR resource rejected: ${problems.length} identifier problem(s): ${problems.slice(0, 5).join("; ")}`);
    this.name = "FhirIdentifierError";
    this.problems = problems;
  }
}

// ---- Panel lookup --------------------------------------------------------------------------------------

const LOINC_CODE = /^\d{1,7}-\d$/;

function norm(s: string): string {
  return s.trim().replace(/\s+/g, " ").toLowerCase();
}

function panelFor(measure: Measure): LoincPanel {
  const code = measure.loinc?.panel;
  if (!code) throw new FhirExportUnavailable(`${measure.shortName} has no LOINC panel`);
  if (!LOINC_CODE.test(code)) throw new FhirExportUnavailable(`${measure.shortName} LOINC panel is malformed`);
  const panel = LOINC_PANELS[code];
  if (!panel) throw new FhirExportUnavailable(`no verified LOINC mapping for panel ${code}`);
  if (measure.loinc?.total && measure.loinc.total !== panel.total) {
    throw new FhirExportUnavailable(`${measure.shortName} total code ${measure.loinc.total} does not match panel ${code}`);
  }
  const ids = measure.items.map((it) => it.id);
  const mapped = Object.keys(panel.items);
  if (ids.length !== mapped.length || ids.some((id) => !panel.items[id])) {
    throw new FhirExportUnavailable(`${measure.shortName} items do not match LOINC panel ${code}`);
  }
  return panel;
}

/** LOINC answer for a measure option, matched on BOTH score and label; undefined when not known. */
function answerFor(panel: LoincPanel, option: Measure["options"][number]): LoincAnswer | undefined {
  return panel.answers.find((a) => a.score === option.value && norm(a.display) === norm(option.label));
}

export interface FhirExportInfo {
  available: boolean;
  /** Questionnaire canonical when available. */
  questionnaire?: string;
  /** Whether the functional-difficulty answer can be included for this measure. */
  includesFunctionalItem: boolean;
  /** Why the export is unavailable, or a note the UI can show (for example about the difficulty item). */
  note?: string;
}

/** What the export can do for a measure, without building anything. Never throws. */
export function describeFhirExport(measure: Measure): FhirExportInfo {
  try {
    const panel = panelFor(measure);
    const includesFunctionalItem = Boolean(panel.functional && measure.functionalItem);
    return {
      available: true,
      questionnaire: `${LOINC_SYSTEM}/q/${panel.panel}`,
      includesFunctionalItem,
      note:
        measure.functionalItem && !includesFunctionalItem
          ? `The difficulty question is not part of the LOINC ${measure.shortName} panel, so it is not included.`
          : undefined,
    };
  } catch (e) {
    return { available: false, includesFunctionalItem: false, note: e instanceof Error ? e.message : String(e) };
  }
}

// ---- Build ---------------------------------------------------------------------------------------------

function localDate(d: Date): string {
  if (Number.isNaN(d.getTime())) throw new RangeError("invalid date for authored");
  const y = String(d.getFullYear()).padStart(4, "0");
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function weightExtension(url: string, score: number): FhirExtension {
  return { url, valueDecimal: score };
}

/**
 * Build a FHIR R4 QuestionnaireResponse for one administration of a measure, with no identifiers.
 * answers[i] is the chosen option value for measure.items[i] (null = unanswered), as in scoreMeasure.
 * Throws RangeError for invalid answers, FhirExportUnavailable for a measure without a verified LOINC
 * mapping, and FhirIdentifierError if the result would contain an identifier (defence in depth).
 */
export function buildQuestionnaireResponse(
  measure: Measure,
  answers: readonly (number | null)[],
  opts: FhirExportOptions = {},
): QuestionnaireResponse {
  const panel = panelFor(measure);
  const score = scoreMeasure(measure, answers); // validates every answer against measure.options
  const linkStyle = opts.linkIds ?? "item";
  if (linkStyle !== "item" && linkStyle !== "loinc") throw new RangeError(`unknown linkIds style ${String(linkStyle)}`);

  const items: QuestionnaireResponseItem[] = [];
  measure.items.forEach((it, i) => {
    const v = answers[i];
    if (v === null || v === undefined) return; // unanswered items are omitted
    const option = measure.options.find((o) => o.value === v);
    if (!option) throw new RangeError(`${measure.shortName} item ${it.id}: invalid answer ${String(v)}`);
    const loincItem = panel.items[it.id] as string; // panelFor checked every id
    const loincAnswer = answerFor(panel, option);
    const answer: QuestionnaireResponseAnswer = loincAnswer
      ? {
          extension: [weightExtension(ITEM_WEIGHT_URL, option.value)],
          valueCoding: {
            extension: [weightExtension(ORDINAL_VALUE_URL, option.value)],
            system: LOINC_SYSTEM,
            code: loincAnswer.code,
            display: loincAnswer.display,
          },
        }
      : { valueInteger: option.value };
    items.push({ linkId: linkStyle === "loinc" ? loincItem : it.id, text: it.text, answer: [answer] });
  });

  if (opts.functional !== null && opts.functional !== undefined && panel.functional && measure.functionalItem) {
    const idx = opts.functional;
    const label = measure.functionalItem.options[idx];
    if (!Number.isInteger(idx) || label === undefined) {
      throw new RangeError(`${measure.shortName} difficulty: invalid answer ${String(idx)}`);
    }
    const coded = panel.functional.answers.find((a) => norm(a.display) === norm(label));
    if (!coded) throw new FhirExportUnavailable(`${measure.shortName} difficulty option "${label}" has no LOINC answer`);
    items.push({
      linkId: panel.functional.code,
      text: measure.functionalItem.text,
      answer: [{ valueCoding: { system: LOINC_SYSTEM, code: coded.code, display: coded.display } }],
    });
  }

  if (score.complete) {
    items.push({
      linkId: panel.total,
      text: `${measure.shortName} total score`,
      answer: [{ valueQuantity: { value: score.total, unit: "{score}", system: UCUM_SYSTEM, code: "{score}" } }],
    });
  }

  const qr: QuestionnaireResponse = {
    resourceType: "QuestionnaireResponse",
    language: "en",
    questionnaire: `${LOINC_SYSTEM}/q/${panel.panel}`,
    _questionnaire: { extension: [{ url: DISPLAY_URL, valueString: measure.name }] },
    status: score.complete ? "completed" : "in-progress",
  };
  if (opts.authoredDate === true) qr.authored = localDate(opts.now ?? new Date());
  if (items.length > 0) qr.item = items;

  validateNoIdentifiers(qr);
  return qr;
}

/** "gad-7-response.fhir.json" */
export function questionnaireResponseFilename(measure: Pick<Measure, "id">): string {
  const id = /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(measure.id) ? measure.id : "measure";
  return `${id}-response.fhir.json`;
}

/** Pretty-printed JSON, validated again on the way out. */
export function serializeQuestionnaireResponse(qr: QuestionnaireResponse): string {
  validateNoIdentifiers(qr);
  return `${JSON.stringify(qr, null, 2)}\n`;
}

/** UTF-8 bytes for downloadBytes(bytes, questionnaireResponseFilename(measure), FHIR_JSON_MIME). */
export function questionnaireResponseBytes(qr: QuestionnaireResponse): Uint8Array {
  return new TextEncoder().encode(serializeQuestionnaireResponse(qr));
}

/**
 * Read the item answers back out of a QuestionnaireResponse built by this module (either linkId style).
 * Used to prove the export round-trips; returns one entry per measure item (null = not present).
 */
export function answersFromQuestionnaireResponse(measure: Measure, resource: unknown): (number | null)[] {
  const panel = panelFor(measure);
  const r = resource as Partial<QuestionnaireResponse> | null;
  if (!r || r.resourceType !== "QuestionnaireResponse") throw new TypeError("not a QuestionnaireResponse");
  const byLink = new Map((r.item ?? []).map((it) => [it.linkId, it]));
  const allowed = new Set(measure.options.map((o) => o.value));
  return measure.items.map((it) => {
    const found = byLink.get(it.id) ?? byLink.get(panel.items[it.id] as string);
    const a = found?.answer?.[0];
    if (!a) return null;
    let v: number | undefined;
    if (typeof a.valueInteger === "number") v = a.valueInteger;
    else if (a.valueCoding?.code) v = panel.answers.find((x) => x.code === a.valueCoding?.code)?.score ?? undefined;
    if (v === undefined || !allowed.has(v)) throw new RangeError(`${measure.shortName} item ${it.id}: unreadable answer`);
    return v;
  });
}

// ---- Identifier guard ------------------------------------------------------------------------------------

/**
 * Keys that may never appear anywhere in an exported resource (compared case-insensitively, with a
 * leading "_" for primitive extensions ignored). Covers FHIR reference/identity elements and
 * demographic elements of Patient/Person-like content.
 */
export const FORBIDDEN_KEYS: readonly string[] = [
  "subject",
  "author",
  "source",
  "encounter",
  "identifier",
  "id",
  "patient",
  "name",
  "telecom",
  "address",
  "birthDate",
  "basedOn",
  "partOf",
  "contained",
  "reference",
  "performer",
];

const FORBIDDEN = new Set(FORBIDDEN_KEYS.map((k) => k.toLowerCase()));

/** String values under these keys are machine tokens (codes, URIs, enums) and skip the PHI-text scan. */
const TOKEN_KEYS = new Set([
  "resourcetype",
  "url",
  "system",
  "code",
  "unit",
  "linkid",
  "questionnaire",
  "status",
  "language",
  "authored",
]);

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Every identifier problem in a resource, as human-readable "path: reason" strings. Empty = clean.
 * Checks: forbidden keys at any depth; a resource-level narrative (`text` on the root object);
 * `authored` other than a bare YYYY-MM-DD date; any free-text string the PHI scrubber flags.
 */
export function findIdentifierProblems(resource: unknown): string[] {
  const problems: string[] = [];
  const seen = new WeakSet<object>();
  const walk = (node: unknown, path: string, key: string, depth: number): void => {
    if (depth > 64) {
      problems.push(`${path}: nested too deeply`);
      return;
    }
    if (typeof node === "string") {
      const k = key.replace(/^_/, "").toLowerCase();
      if (k === "authored" && !DATE_ONLY.test(node)) problems.push(`${path}: authored must be YYYY-MM-DD only`);
      if (!TOKEN_KEYS.has(k) && containsPHI(node)) problems.push(`${path}: value looks like an identifier`);
      return;
    }
    if (node === null || typeof node !== "object") return;
    if (seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) {
      node.forEach((v, i) => walk(v, `${path}[${i}]`, key, depth + 1));
      return;
    }
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      const bare = k.replace(/^_/, "").toLowerCase();
      const p = path ? `${path}.${k}` : k;
      if (FORBIDDEN.has(bare)) problems.push(`${p}: forbidden key "${k}"`);
      if (depth === 0 && bare === "text") problems.push(`${p}: narrative is not allowed`);
      walk(v, p, k, depth + 1);
    }
  };
  walk(resource, "", "", 0);
  return problems;
}

/** Throws FhirIdentifierError when findIdentifierProblems reports anything. */
export function validateNoIdentifiers(resource: unknown): void {
  const problems = findIdentifierProblems(resource);
  if (problems.length > 0) throw new FhirIdentifierError(problems);
}
