import "server-only";
/**
 * Pure text guards for the assistant. No I/O, no logging.
 *
 * Input side (the request is REFUSED before any SDK call when one of these fires):
 * - mentionsSubstanceUse(): 42 CFR Part 2 gate. Text that mentions alcohol or drug use is never sent. Tobacco,
 *   nicotine and caffeine are outside Part 2 and are not matched; prescribed medication names alone are not either.
 * - looksLikeReferenceText(): pasted or cited diagnostic-manual criteria (DSM-5-TR) or treatment-planner (Wiley
 *   PracticePlanners) text. The owner amendment allows neither in the input.
 * - lowercaseIdentifier(): a stricter, assistant-only re-check on top of the shared PHI scrubber. The scrubber
 *   relies on capitals for single names ("Jose", "Emily"); text typed in lower case ("client is jose") or digits
 *   spelled out ("five five five one two one two") would otherwise pass. Some names that are also common English
 *   or Spanish words ("nick", "foster", "pena", "flores") are left out on purpose, and names of three letters or
 *   fewer are not checked: the scrubber stays the main safety net and the UI must still say "no identifiers".
 *
 * Output side (model text is DROPPED, never rewritten into something else):
 * - sanitizeModelText(): plain text only (markup, controls, bidi and emoji removed), Latin script only, no links or
 *   URI schemes, no identifiers (PHI scrubber and the lower-case re-check find nothing), no statistics, no echo of the instructions, and no
 *   clinical-rule violation (violatesClinicalRules). Returns null when the text must be dropped.
 * - violatesClinicalRules(): a stated diagnosis, criteria or thresholds being met, any DSM mention, or a risk
 *   estimate, grade or "is safe" statement. The model is told not to; this is the server-side check.
 */
import { scrubPHI } from "@/lib/phi-scrubber";
import { SYSTEM_PROMPT } from "./prompt";

/** Lowercase, accents folded ("cocaína" -> "cocaina"), so English and Spanish patterns stay ASCII. */
export function fold(s: string): string {
  return s.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();
}

/* ================================================================== input: 42 CFR Part 2 */

const SUD_PATTERNS: readonly RegExp[] = [
  // English: alcohol
  /\b(?:alcohol\w*|drunk\w*|hungover|hangovers?|binge[- ]?drink\w*|booze\w*|liquor|beers?|wine|vodka|whiske?y|tequila|rum|gin|sober\w*|sobriety|nightcaps?|tipsy|buzzed)\b/,
  /\bdrinking\b(?!\s+(?:water|coffee|tea|fluids|liquids|enough|juice|milk|soda))/,
  /\bdrinks?\s+(?:a lot|heavily|daily|every|too much|to cope|at night|before)\b/,
  // English: drugs and use ("drug" alone is often a prescribed medication, so it needs a use cue)
  /\bdrugs? (?:use|using|abuse|habit|problem|seeking|screen|test)\b|\b(?:on|uses?|using|did|does|doing|took|takes|street|recreational|illicit|illegal|hard|party) drugs?\b/,
  /\b(?:substances?|marijuana|cannabis|weed|thc|edibles?|cocaine|heroin|fentanyl|opioids?|opiates?|oxycodone|oxycontin|percocet|vicodin|hydrocodone|morphine|methadone|suboxone|buprenorphine|naloxone|narcan|meth|methamphetamine|amphetamines?|ecstasy|mdma|molly|lsd|psilocybin|shrooms|ketamine|benzos|kratom|inhalants?|huffing|overdos\w*|intoxicat\w*|detox\w*)\b/,
  /\b(?:getting|got|gets|being|was|were) high\b|\bhigh on\b|\bmagic mushrooms?\b|\bacid trip\b|\bpills? (?:to get|for fun)\b/,
  /\b(?:prescription|pill|opioid|stimulant|sedative|medication) (?:mis|ab)use\b/,
  /\b(?:aa|na) meetings?\b|\bwithdrawal from (?:alcohol|drugs?|opioids?|benzo\w*)\b/,
  /\b(?:etoh|dts|delirium tremens|eye[- ]?openers?|last drink)\b|\bneeds? a drink\b|\bcravings? (?:for )?(?:a drink|alcohol|drugs?)\b|\burges? to (?:use|drink)\b/,
  // Spanish (accents folded). "vino" (also "came") and "rehabilitacion" (also physical rehab) are left out.
  /\b(?:borrach\w*|resaca|cerveza\w*|licor\w*|sobriedad|sobri[oa]s?)\b/,
  /\b(?:drogas?|sustancias?|marihuana|cocaina|heroina|fentanilo|opioides?|opiaceos?|metanfetamina|extasis|sobredosis|desintoxicacion|intoxicad[oa]s?)\b/,
  /\b(?:consumo|uso|abuso) de (?:alcohol|drogas?|sustancias?)\b|\bbebe (?:mucho|demasiado|diario|todos los dias)\b|\btoma alcohol\b/,
];

export function mentionsSubstanceUse(text: string): boolean {
  if (!text) return false;
  const t = fold(text);
  return SUD_PATTERNS.some((re) => re.test(t));
}

/* ================================================================== input: reference-manual text */

const REFERENCE_PATTERNS: readonly RegExp[] = [
  /\bdsm\b|\bdsm-?(?:iv|5|5-?tr)\b|\bmanual diagnostico\b/,
  // "criterion b", "criteria a-c", "criterio 2": the structure of a criteria set
  /\bcriteri(?:on|a|o|os)\s+[a-h1-9](?:\b|[.)\-:])/,
  /\bpractice ?planners?\b|\bwiley\b/,
];
/** Enumerated criteria markers at the start of a line or sentence ("A. ...  B. ..." or "A) ..."); three distinct letters count. */
const ENUMERATED_ITEM = /(?:^|[\n.;:]\s*)\(?([A-H])[.)]\s+\p{Lu}/gu;

/** True when the text quotes, cites or mirrors a diagnostic-manual criteria set or treatment-planner text. */
export function looksLikeReferenceText(text: string): boolean {
  if (!text) return false;
  const t = fold(text);
  if (REFERENCE_PATTERNS.some((re) => re.test(t))) return true;
  const letters = new Set([...text.matchAll(ENUMERATED_ITEM)].map((m) => m[1]));
  return letters.size >= 3;
}

/* ================================================================== input: stricter identifier re-check */

/**
 * Listed names (in the shared scrubber) that are also everyday English or Spanish words a note may contain. They
 * are not treated as names when typed in lower case. Folded spelling.
 */
const NAME_WORDS_ALSO_COMMON: ReadonlySet<string> = new Set(
  (
    "nick mason foster jean mike randy billy bobby jimmy karen jake carter tanner warren riley heather jasmine matt " +
    "norman willie ella tomas marco rosa pilar consuelo gloria victoria cesar pena flores moreno delgado santos reyes " +
    "morales torres castillo rocio"
  ).split(" "),
);
const LOWER_TOKEN = /(?<![\p{L}\p{N}'’-])\p{Ll}{4,}(?![\p{L}\p{N}])/gu;
const DIGIT_WORDS = "(?:zero|oh|one|two|three|four|five|six|seven|eight|nine|cero|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve)";
/** Five or more digits spelled out in a row: a phone number, ID or date typed as words. */
const SPELLED_DIGITS = new RegExp(`\\b${DIGIT_WORDS}(?:[\\s,.-]+${DIGIT_WORDS}){4,}\\b`);

/**
 * True when text the shared scrubber accepted still carries a likely identifier: a listed given name or surname of
 * four or more letters typed in lower case, or a spelled-out number of five or more digits.
 */
export function lowercaseIdentifier(text: string): boolean {
  if (!text) return false;
  const folded = fold(text);
  if (SPELLED_DIGITS.test(folded)) return true;
  const seen = new Set<string>();
  for (const m of text.matchAll(LOWER_TOKEN)) {
    const tok = fold(m[0]);
    if (seen.has(tok) || NAME_WORDS_ALSO_COMMON.has(tok)) continue;
    seen.add(tok);
    // The scrubber flags listed names typed in capitals ("JOSE"); reuse that list instead of copying it.
    if (scrubPHI(tok.toUpperCase()).findings.some((f) => f.type === "NAME")) return true;
  }
  return false;
}

/* ================================================================== output: clinical rules */

/**
 * Condition words. The catalog's condition names are added at runtime (setConditionNames) so a renamed or new
 * condition is covered without editing this list.
 */
const CONDITION_WORDS =
  "disorders?|phobias?|syndromes?|c-?ptsd|ptsd|gad|ocd|mdd|pdd|adhd|bpd|bipolar|agoraphobi\\w*|depression|dysthymi\\w*|schizo\\w*|psychosis|psychotic|anorexia|bulimia|" +
  "trastornos?|fobias?|sindromes?|tept|toc|tag|depresion|agorafobi\\w*|psicosis|psicotic[oa]";
let conditionAlternation = CONDITION_WORDS;
let conditionRe: RegExp;
let strongRe: RegExp;
let weakRe: RegExp;

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Who or what a stated diagnosis would be about ("the client has...", "this is...", "ella tiene..."). */
const SUBJECT = "client|patient|person|individual|they|she|he|this|that|it|presentation|picture|profile|symptoms?|pattern|ella|el|cliente|paciente|persona|esto|eso|cuadro";

function compileDiagnosisPatterns() {
  const cond = `(?:${conditionAlternation})`;
  conditionRe = new RegExp(`\\b${cond}\\b`);
  // Assertive anywhere (also inside a question): "consistent with panic disorder", "likely GAD".
  strongRe = new RegExp(
    `\\b(?:impression|consistent with|indicative of|indicat\\w*|confirm\\w*|meets?|met|qualif\\w*|fulfil\\w*|rules? in|ruled in|(?:most |very |highly )?likely|probabl\\w*|clearly|definitely|certainly|undoubtedly|obviously|` +
      `compatible con|indica\\w*|cumple\\w*|probablemente|claramente|seguramente|sin duda)\\b(?:\\W+\\w+){0,5}?\\W+${cond}\\b|` +
      `\\b${cond}\\b(?:\\W+\\w+){0,3}?\\W+(?:is|are|seems|appears) (?:likely|probable|confirmed|present|met|clear|evident)\\b`,
  );
  // Assertive about the person, in a statement: "The client has panic disorder", "This is OCD", "Ella tiene TEPT".
  weakRe = new RegExp(
    `\\b(?:${SUBJECT})\\b(?:\\W+\\w+){0,2}?\\W+(?:has|have|had|is|are|was|were|suffers?|suffering|presents? with|tiene|padece|sufre|es|presenta)\\b(?:\\W+\\w+){0,4}?\\W+${cond}\\b`,
  );
}
compileDiagnosisPatterns();

/** True when the text names a condition (catalog names, common abbreviations, "disorder", "phobia", ...). */
export function mentionsCondition(text: string): boolean {
  return conditionRe.test(fold(text));
}

/** Adds the catalog's condition names (and their "... disorder"-less forms of two or more words) to the guard. */
export function setConditionNames(names: readonly string[]) {
  const extra = new Set<string>();
  for (const n of names) {
    const f = fold(n).replace(/\s+/g, " ").trim();
    if (!f) continue;
    extra.add(f);
    const bare = f.replace(/\s+disorder$/, "");
    if (bare !== f && /[\s-]/.test(bare)) extra.add(bare);
  }
  const alts = [...extra].sort((a, b) => b.length - a.length || (a < b ? -1 : 1)).map((s) => escapeRe(s).replace(/ /g, "\\s+"));
  conditionAlternation = [...alts, CONDITION_WORDS].join("|");
  compileDiagnosisPatterns();
}

const GRADE = "no|low|lower|lowest|minimal|little|slight|moderate|medium|high|higher|highest|elevated|imminent|significant|serious|severe|increased|reduced|negligible|zero|acute";
const RISK_PATTERNS: readonly RegExp[] = [
  new RegExp(`\\b(?:${GRADE})\\b(?:\\W+\\w+){0,3}?\\W+risks?\\b`),
  /\brisks?\b(?:\W+\w+){0,3}?\W+(?:low|high|moderate|minimal|elevated|imminent|negligible|none|absent|unlikely|likely|acceptable)\b/,
  /\brisk (?:level|score|rating|tier|category|grade|status|estimate|stratification)\b/,
  /\b(?:not|isn't|isnt|is not|aren't|are not|no longer)\b(?:\W+\w+){0,2}?\W+(?:at|a) risk\b/,
  /\b(?:is|are|seems?|appears?|looks?|considered|deemed|remains?|feels?)\s+(?:to be\s+)?(?:safe|not dangerous|out of danger|not a danger)\b/,
  /\bsafe to (?:discharge|leave|send|go|be alone)\b|\bno (?:immediate |current |acute )?(?:danger|threat|safety concerns?)\b/,
  // Spanish
  /\briesgos?\b(?:\W+\w+){0,3}?\W+(?:bajo|alto|moderado|minimo|nulo|elevado|inminente|ninguno|escaso|leve|grave|serio)\b/,
  /\b(?:bajo|alto|moderado|minimo|nulo|elevado|inminente|escaso|leve|poco|mucho|sin)\b(?:\W+\w+){0,2}?\W+riesgos?\b|\bnivel de riesgo\b/,
  /\b(?:esta|estan|parece|parecen)\s+(?:a salvo|segur[oa]s?|fuera de peligro)\b|\bsin peligro\b|\bno (?:hay|existe) (?:riesgo|peligro)\b/,
];

/** True when model text breaks a clinical rule (diagnosis, criteria, DSM, risk grading). */
export function violatesClinicalRules(text: string): boolean {
  const t = fold(text).replace(/\s+/g, " ").trim();
  // Model text never talks about diagnosis, the DSM or criteria at all (the app adds its own pointers).
  if (/\bdsm\b|\bcriteri(?:on|a|o|os)\b|\bdiagnos\w*|\bdiagnost\w*|\bdx\b/.test(t)) return true;
  if (/\b(?:meets?|met|fulfils?|fulfills?|satisf(?:y|ies)|cumple)\b(?:\W+\w+){0,3}?\W+(?:threshold|requirements?|umbral|requisitos)\b/.test(t)) return true;
  if (strongRe.test(t)) return true;
  if (!t.endsWith("?") && weakRe.test(t)) return true;
  return RISK_PATTERNS.some((re) => re.test(t));
}

/* ================================================================== output: instructions echo, statistics */

const META = /\b(?:system prompt|prompt|my (?:instructions|rules)|instructions above|presentation[_ ]state|catalog|json|schema|as an ai|language model|anthropic|claude|ignore (?:all|previous|the|any|these)|jailbreak|developer mode|role ?play)\b/;

function shingles(text: string, n: number): Set<string> {
  const w = fold(text).split(/[^a-z0-9]+/).filter(Boolean);
  const out = new Set<string>();
  for (let i = 0; i + n <= w.length; i++) out.add(w.slice(i, i + n).join(" "));
  return out;
}
const PROMPT_SHINGLES = shingles(SYSTEM_PROMPT, 6);

/** True when model text talks about its instructions or repeats six or more words of the system prompt in a row. */
export function echoesInstructions(text: string): boolean {
  if (META.test(fold(text))) return true;
  for (const s of shingles(text, 6)) if (PROMPT_SHINGLES.has(s)) return true;
  return false;
}

/** Statistics need a source and a year (CLAUDE.md); model text has neither, so any statistic is dropped. */
const STATS = /\d\s*%|\bpercent\b|\bpor ?ciento\b|\b\d+ (?:in|out of|de cada) \d+\b|\b(?:studies|research|evidence|estudios) (?:show|shows|found|suggest|suggests|indica\w*|muestra\w*)\b|\bprevalen\w*\b/;

/* ================================================================== output: sanitizer */

const TAGS = /<[^<>]{0,200}>/g;
const MD_LINK = /\[([^\]]{0,200})\]\([^)]{0,500}\)/g;
/** Any link-like thing: URLs, www., URI schemes (javascript:, data:, mailto:, tel:...), markdown links. */
const LINKISH = /\b(?:https?|ftp|file|javascript|vbscript|data|blob|mailto|tel|sms|intent|about)\s*:|\bwww\.|\]\(|\b[a-z0-9-]+\.(?:com|org|net|gov|edu|io|co|us|info|app|ly|me|health)\b/i;
const MD_MARKS = /[*_`#~|<>\\^]+/g;
// C0/C1 controls, zero-width and bidi controls (Trojan-source style reordering), BOM
const CONTROL = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F­​-‏‪-‮⁠-⁯﻿]/g;
const EMOJI = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{FE0F}\u{20E3}]/gu;
/** Latin letters (English / Spanish) only: other scripts are where look-alike letters hide. */
const NON_LATIN_LETTER = /(?=\p{L})[^\p{Script=Latin}]/u;

/**
 * Markup removed, whitespace collapsed, at most `max` characters. Does NOT judge the content: use
 * sanitizeModelText() for model text.
 */
export function cleanModelText(input: unknown, max: number): string {
  if (typeof input !== "string") return "";
  let t = input.normalize("NFKC").replace(CONTROL, "");
  t = t.replace(MD_LINK, "$1").replace(TAGS, "").replace(EMOJI, "").replace(MD_MARKS, " ");
  t = t.replace(/[\t\n\r\f\v]+/g, " ").replace(/\s+/g, " ").trim();
  if (t.length > max) t = `${t.slice(0, max - 1).trimEnd()}…`;
  return t;
}

/**
 * Model text the UI may show, or null when it must be dropped: link-like content, a non-Latin letter, an identifier
 * the PHI scrubber finds, a statistic, an echo of the instructions, substance-use content, or a clinical-rule
 * violation. Placeholders such as [NAME] that came from the clinician's own scrubbed note are allowed.
 */
export function sanitizeModelText(input: unknown, max: number): string | null {
  if (typeof input !== "string") return null;
  const raw = input.normalize("NFKC").replace(CONTROL, "");
  if (LINKISH.test(raw)) return null;
  const t = cleanModelText(raw, max);
  if (!t || NON_LATIN_LETTER.test(t)) return null;
  if (scrubPHI(t).findings.length > 0 || lowercaseIdentifier(t)) return null;
  if (STATS.test(fold(t)) || echoesInstructions(t) || mentionsSubstanceUse(t) || violatesClinicalRules(t)) return null;
  return t;
}

/** Model-authored question ids: kebab-case, 1-48 chars, else a positional id. */
export function cleanQuestionId(input: unknown, index: number): string {
  const s = typeof input === "string" ? input.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") : "";
  return /^[a-z0-9][a-z0-9-]{0,47}$/.test(s) ? s.slice(0, 48) : `q-${index + 1}`;
}
