/**
 * Explainable, deterministic symptom matcher (spec section 4).
 * Pure functions over memory-only data: nothing passed in is stored, logged or sent anywhere (G5).
 * Callers must run the PHI scrubber on free text before calling matchSymptoms.
 *
 * matchSymptoms(text, symptoms) pipeline:
 *  1. Segments: the text is split at . , ; : ! ? and line breaks. A plain phrase never spans two segments.
 *     Segments joined only by commas form one "sentence group" (used by gap patterns, step 3).
 *  2. Tokens: each segment is normalized (normalizeText) and split on spaces. Every token gets a light
 *     stem (stem(): a few irregular forms first, e.g. goes/going/went -> go, couldnt/unable/cannot -> cant,
 *     doesnt/didnt -> dont, hasnt -> havent, wanna -> want, and every reflexive pronoun -> "self"; then
 *     -ing / -ed / -ly / -s(-es), trailing e, y->i, ck->c, doubled consonant) and a stopword flag
 *     (STOPWORDS). Contrast words (but, however, although, though, except, whereas) start a new negation
 *     clause; so does every new segment.
 *  3. Phrases: each symptom's label, clientLabel and synonyms are normalized and stemmed the same way.
 *     - Plain phrase: stopwords are removed on both sides, and the phrase matches when its stems appear
 *       as a contiguous run of NON-stopword tokens in one segment ("cant leave my house" ~ "cant leave
 *       the house", "worrying" ~ "worry").
 *     - Word-for-word phrase: if removing stopwords would leave fewer than two words ("was attacked",
 *       "the shakes", "on edge", "losing it"), the phrase keeps every word and must match the same words
 *       in order, so it can never collapse into one generic word ("attack", "shake", "edge").
 *     - Gap pattern (synonyms only): "A ... B" means B follows A with at most MAX_GAP content words in
 *       between, in the same sentence group (commas allowed, so "avoids buses, trains and the mall" works)
 *       and with no contrast word skipped. Each part matches word for word, stopwords included (so
 *       "panic in ... crowds" needs "panic in"); personal pronouns are interchangeable (he/she/i -> one
 *       stem), so "when she stops drinking" ~ "when i stop drinking". "|" lists alternatives inside a
 *       part: "avoid|afraid of ... bus|buses". Gap matches are non-consuming: they neither block nor are
 *       blocked by other phrases, so one mention can support two features ("panic attacks in stores" ->
 *       situational panic AND dread of stores). Position and order use part B. Reported phrase: the
 *       alternatives that matched, as written, joined by " ... ".
 *  4. Overlap (plain and word-for-word phrases): the longest phrase wins (most non-stopword tokens, then
 *     most characters); ties go to the earlier position, then lexicon order. Spans are taken greedily
 *     and never overlap.
 *  5. Negation (deliberately conservative: a missed negation shows one extra item for clinician review,
 *     a wrong negation could hide a red flag):
 *     - strong cues (STRONG_NEGATION_CUES: "denies", "negative for", "no history of", ...) negate
 *       phrases later in the SAME clause. The scope ends at an affirming verb (reports, endorses,
 *       describes, admits, complains) and at a conjunction followed by a new predicate ("and has",
 *       "and feels", "and is now", "and hears", "and she": PREDICATES), so "Denies SI and has been
 *       hearing voices" keeps the voices. A red-flag phrase needs a tight link: between the cue and it only
 *       other matched phrases, list words and at most 3 stopwords or fillers ("denies any current
 *       thoughts of suicide"). A cue inside a matched phrase is ignored.
 *     - bare negators ("no", "not", "never", "without", "nor" and contractions such as "doesn't",
 *       "hasn't", "didn't") negate the phrase right after them; stopwords and a few fillers may sit in
 *       between ("doesn't have", "not currently", "no longer has"). A phrase that itself begins with a
 *       negation stays positive ("no interest in anything", "doesn't enjoy anything").
 *     - post-phrase negation: "SI: denied", "HI - none", "AVH: negative", "suicidal thoughts? No".
 *     - list spreading: a negated phrase passes the negation on to the next phrase when only list words
 *       sit between ("no SI or HI", "no nightmares or flashbacks"); across a comma only to a one-word
 *       abbreviation ("No SI, HI, or AVH"); never past a new predicate ("no SI and hears voices").
 *     - a gap pattern is negated when either its first part (A) or its matched part (B) is negated.
 *     - case-restricted abbreviations (SI, HI, AVH, SOB) match alone only in capitals or next to a
 *       clinical word, so "SI joint", "dice que si", "hi there" and "sobbing" never match.
 *  6. Attribution: phrases about a relative ("mother has depression", "family history of",
 *     "her father's PTSD") or resolved past history ("depression in remission", "past history of") go
 *     to `attributed` and are not scored. Red-flag phrases are never attributed.
 *  7. One entry per symptomId. Positive wins over negated, negated over attributed; the three lists
 *     never share an id. Results are in order of first mention. `phrase` is the lexicon phrase
 *     (synonym, label or clientLabel) that matched, as written.
 *
 * searchSymptoms(query, symptoms) is a fuzzy chip search (Fuse.js) over label, clientLabel, synonyms
 * (gap patterns are left out of the chip index).
 * Indexes for both functions are built lazily and cached per symptoms array (WeakMap).
 */
import Fuse from "fuse.js";
import type { Symptom } from "./schemas";

export interface SymptomMatch {
  symptomId: string;
  phrase: string;
}

/** A mention about someone else (family history) or resolved past history: shown, never scored. */
export interface AttributedMatch extends SymptomMatch {
  reason: "family" | "historical";
}

export interface MatchResult {
  matches: SymptomMatch[];
  negated: SymptomMatch[];
  /** Family history and resolved past history. Never includes red-flag symptoms (those stay in matches). */
  attributed: AttributedMatch[];
}

/* ------------------------------------------------------------------ normalization */

const APOSTROPHES = /['`´‘’‛′ʼ＇]/g;
const COMBINING_MARKS = /[̀-ͯ]/g;

/** Lowercase, strip accents, drop apostrophes (can't -> cant, i'm -> im), punctuation -> space, collapse spaces. */
export function normalizeText(s: string): string {
  return s
    .normalize("NFKD")
    .replace(COMBINING_MARKS, "")
    .toLowerCase()
    .replace(APOSTROPHES, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

const VOWELS = new Set(["a", "e", "i", "o", "u"]);

/**
 * Irregular forms that the suffix rules cannot join. Kept small and unambiguous; both the lexicon and
 * the typed text go through the same map, so it only ever widens matches between equivalent wordings.
 */
const IRREGULAR_STEMS: Readonly<Record<string, string>> = {
  goes: "go", going: "go", gone: "go", went: "go", gonna: "go",
  dying: "die", dies: "die",
  lying: "lie",
  cries: "cry", cried: "cry", crying: "cry",
  tries: "try", tried: "try", trying: "try",
  cannot: "cant", unable: "cant", couldnt: "cant",
  doesnt: "dont", didnt: "dont",
  hasnt: "havent", hadnt: "havent",
  wanna: "want",
  // Personal pronouns and their "be" contractions: only ever compared in word-for-word phrases.
  i: "_p", he: "_p", she: "_p", they: "_p", we: "_p", you: "_p",
  me: "_p", him: "_p", her: "_p", them: "_p",
  my: "_p", his: "_p", their: "_p", our: "_p", your: "_p",
  im: "_pb", hes: "_pb", shes: "_pb", theyre: "_pb", youre: "_pb",
  myself: "self", yourself: "self", himself: "self", herself: "self", itself: "self",
  ourselves: "self", yourselves: "self", themselves: "self", themself: "self", oneself: "self",
};

/**
 * Light, consistent stemmer. It does not aim for dictionary words, only for the same output on both
 * sides: worry / worries / worried / worrying -> "worri"; panic / panics / panicked / panicking -> "panic".
 */
export function stem(token: string): string {
  const irregular = IRREGULAR_STEMS[token];
  if (irregular) return irregular;
  let w = token;
  if (w.length <= 3 || /\d/.test(w)) return w;
  if (w.endsWith("ing") && w.length - 3 >= 3) w = w.slice(0, -3);
  else if (w.endsWith("ed") && !w.endsWith("eed") && w.length - 2 >= 3) w = w.slice(0, -2);
  else if (w.endsWith("ly") && w.length - 2 >= 4) w = w.slice(0, -2);
  else if (w.endsWith("s") && !/(ss|us|is)$/.test(w) && w.length - 1 >= 3) w = w.slice(0, -1);
  if (w.length > 3 && w.endsWith("e")) w = w.slice(0, -1);
  if (w.length > 3 && w.endsWith("y")) w = `${w.slice(0, -1)}i`;
  if (w.length > 3 && w.endsWith("ck")) w = w.slice(0, -1);
  const last = w.charAt(w.length - 1);
  if (w.length > 3 && last === w.charAt(w.length - 2) && !VOWELS.has(last)) w = w.slice(0, -1);
  return w;
}

/**
 * Ignored on both sides when matching plain phrases. Never contains negation words. Reflexive pronouns
 * are NOT stopwords: they all stem to "self", so "cut myself" ~ "cuts herself" but never "cut back".
 */
export const STOPWORDS: ReadonlySet<string> = new Set([
  "the", "a", "an", "my", "his", "her", "their", "our", "your", "its",
  "of", "to", "in", "at", "on", "about", "for", "with", "from", "by",
  "really", "very", "so", "just", "quite", "too", "also",
  "this", "that", "these", "those", "there", "any", "some",
  "is", "am", "are", "was", "were", "be", "been", "being",
  "i", "im", "ive", "me", "he", "hes", "him", "she", "shes", "they", "theyre", "them",
  "we", "you", "youre", "it",
  "do", "does", "did", "have", "has", "had", "having",
]);

const CONTRAST_WORDS = new Set(["but", "however", "although", "though", "except", "whereas"]);

/**
 * Bare negators: negate the phrase right after them (stopwords and NEG_SKIP fillers may sit in
 * between). Contractions are normalized without the apostrophe ("doesn't" -> "doesnt").
 */
const BARE_NEGATIONS = new Set([
  "no", "not", "never", "nor", "neither", "without",
  "doesnt", "dont", "didnt", "hasnt", "havent", "hadnt", "isnt", "wasnt", "arent", "werent",
]);
/** Fillers a bare negator may skip besides stopwords: "not currently suicidal", "no longer has panic attacks". */
const NEG_SKIP = new Set(["experience", "experiences", "experienced", "experiencing", "currently", "actively", "presently", "longer"]);
/** A bare negator never reaches back past a new subject ("no, she has nightmares"). */
const SUBJECTS = new Set(["i", "she", "he", "they", "we", "you", "client", "pt", "patient"]);

/** A phrase starting with one of these is itself a negative statement ("no interest in anything"). */
const NEGATION_START = new Set([
  "no", "not", "never", "none", "nothing", "nobody", "cant", "cannot", "dont", "doesnt", "didnt",
  "wont", "isnt", "arent", "wasnt", "havent", "hasnt", "hadnt", "couldnt", "unable", "without",
]);

/** Strong negation cues (normalized, unstemmed word sequences). Scope: the rest of the clause (see below). */
export const STRONG_NEGATION_CUES: readonly string[] = [
  "denies", "denied", "denying", "deny",
  "negative for",
  "no history of", "no hx of", "no evidence of", "no signs of", "no sign of",
  "does not report", "doesnt report", "did not report", "didnt report",
  "does not endorse", "doesnt endorse", "did not endorse", "didnt endorse",
  "not experiencing", "not reporting", "not endorsing",
  "absence of",
  "ruled out",
];
const CUE_TOKENS: readonly string[][] = STRONG_NEGATION_CUES.map((c) => c.split(" "));

/** An affirming verb between a strong cue and a phrase ends the cue's scope ("denies si and reports hi"). */
const AFFIRM_STEMS = new Set(["reports", "endorses", "describes", "admits", "complains"].map(stem));

/** Words that join list items ("no si or hi", "denies nightmares nor flashbacks"). */
const SEPARATORS = new Set(["and", "or", "nor", "plus", "either", "neither"]);

/** A conjunction followed (within two words) by one of these starts a new statement: the scope of a cue ends there. */
const SCOPE_BREAK_CONJ = new Set(["and", "or", "then", "now", "plus", "also", "so", "while"]);
/**
 * New-predicate words (verbs, "now/currently", new subjects). "Denies SI and has been hearing voices",
 * "denies depression and feels hopeless", "negative for mania and is now spending": the cue stops at "and".
 */
const PREDICATES = new Set([
  "has", "have", "had", "is", "are", "was", "were", "been",
  "feels", "feel", "felt", "wants", "want", "wanted", "says", "said", "states", "stated",
  "hears", "heard", "sees", "saw", "believes", "believed", "thinks", "started", "starts", "start",
  "began", "begins", "became", "becomes", "currently", "now", "reports", "reported", "endorses", "endorsed",
  "describes", "described", "admits", "admitted", "complains", "complained", "notes", "noted",
  "keeps", "kept", "continues", "continued", "gets", "got", "experiences", "experienced", "presents",
  "presented", "appears", "seems", "acknowledges", "expresses", "expressed", "shows", "showed",
  "displays", "exhibits", "can", "cant", "cannot", "could", "couldnt", "will", "would", "wont", "may",
  "might", "does", "did", "doesnt", "didnt", "hasnt", "havent",
  "i", "she", "he", "they", "we", "client", "pt", "patient",
]);

/**
 * Red-flag phrases need a tight link to a strong cue: between the cue and the phrase only other
 * matched phrases, list separators and at most RED_FLAG_LOOSE stopwords or these fillers may sit.
 */
const RED_FLAG_FILLERS = new Set([...NEG_SKIP, "any", "current", "recent", "active", "ongoing", "feeling", "feelings", "thoughts", "thought"]);
const RED_FLAG_LOOSE = 3;

/** Post-phrase negation: "SI: denied", "HI - none", "AVH: negative", "Suicidal thoughts? No." */
const POST_NEGATIONS = new Set(["denied", "denies", "deny", "none", "negative", "neg", "no", "absent", "nil", "never", "not"]);
const POST_NEG_TAIL = new Set(["reported", "noted", "endorsed", "present", "currently", "today", "now", "elicited", "observed"]);

/**
 * Short abbreviations that are also ordinary words or abbreviations elsewhere ("SI joint", "dice que
 * si", "hi there", "she was sobbing"). As a one-word phrase they match only when typed in capitals,
 * or (CONTEXT_ABBREVIATIONS) next to a clinical word ("denies si", "active si", "si/hi").
 */
export const CASE_RESTRICTED_ABBREVIATIONS: ReadonlySet<string> = new Set(["si", "hi", "avh", "sob"]);
const CONTEXT_ABBREVIATIONS = new Set(["si", "hi", "avh"]);
const ABBREVIATION_NEIGHBORS = new Set([
  "denies", "denied", "deny", "denying", "endorses", "endorsed", "endorsing", "endorse", "reports", "reported",
  "admits", "admitted", "active", "passive", "current", "recent", "chronic", "fleeting", "intermittent",
  "positive", "negative", "neg", "pos", "plan", "plans", "intent", "ideation", "si", "hi", "avh", "ah", "vh",
  "no", "any",
]);
const ABBREVIATION_NOT_BEFORE: Readonly<Record<string, ReadonlySet<string>>> = {
  si: new Set(["joint", "joints", "unit", "units"]),
  hi: new Set(["res", "fi", "tech", "there"]),
};

/**
 * Attribution (not scored): phrases about relatives, and resolved past history, go to `attributed`.
 * Red-flag phrases are never attributed: they always surface for the clinician.
 */
const RELATIVES = new Set([
  "mother", "father", "mom", "mum", "dad", "brother", "sister", "sibling", "siblings", "parent", "parents",
  "son", "daughter", "aunt", "uncle", "cousin", "grandmother", "grandfather", "grandma", "grandpa",
  "grandparent", "grandparents", "husband", "wife", "spouse", "partner", "boyfriend", "girlfriend",
  "stepmother", "stepfather", "stepmom", "stepdad", "niece", "nephew", "twin", "relative", "relatives",
]);
const FAMILY_VERBS = new Set(["has", "had", "have", "suffers", "suffered", "struggles", "struggled", "diagnosed", "dx", "battled", "battles"]);
const FAMILY_CUES: readonly string[][] = [
  "family history of", "family hx of", "family history significant for", "family history positive for",
  "family psychiatric history of", "family history includes", "fhx of", "fhx", "fh of", "fam hx of",
].map((c) => c.split(" "));
const HISTORY_CUES: readonly string[][] = [
  "past history of", "past hx of", "remote history of", "remote hx of", "prior history of", "previous history of",
].map((c) => c.split(" "));
const REMISSION_WORDS = new Set(["remission", "resolved", "remitted"]);
const REMISSION_SKIP = new Set(["full", "partial", "now", "since", "currently", "sustained", "early", "complete", "completely", "fully", "long"]);

/** Gap patterns: at most this many content words may sit between two parts. */
const MAX_GAP = 5;
const GAP = "...";

/* ------------------------------------------------------------------ index */

interface PhraseEntry {
  symptomId: string;
  phrase: string; // reported phrase, as written (alternatives that apply, joined by " ... ")
  kind: "plain" | "exact" | "gap";
  parts: string[][]; // stems per part; plain: content words only; exact and gap: every word
  size: number; // content words across all parts (ranking)
  chars: number;
  negStart: boolean; // first part starts with a negation word
  lastNegStart: boolean; // last part starts with a negation word (gap patterns)
  red: boolean; // the symptom carries a red flag: tighter negation, never attributed
  order: number;
}

interface MatcherIndex {
  plainByFirst: Map<string, PhraseEntry[]>; // keyed by first stem, matched over content tokens
  exactByFirst: Map<string, PhraseEntry[]>; // keyed by first stem, matched over all tokens
  gapByFirst: Map<string, PhraseEntry[]>; // keyed by first stem of the first part, over all tokens
}

const matcherCache = new WeakMap<readonly Symptom[], MatcherIndex>();

const isPattern = (phrase: string) => phrase.includes(GAP) || phrase.includes("|");

/** Expand "a|b ... c|d" into every combination of alternatives: [{ display, parts }]. */
function expandPattern(phrase: string): { display: string; parts: string[] }[] {
  const parts = phrase.split(GAP).map((p) =>
    p
      .split("|")
      .map((a) => a.trim())
      .filter((a) => a.length > 0),
  );
  if (parts.some((alts) => alts.length === 0)) return [];
  let combos: string[][] = [[]];
  for (const alts of parts) combos = combos.flatMap((c) => alts.map((a) => [...c, a]));
  return combos.map((c) => ({ display: c.join(" ... "), parts: c }));
}

const words = (s: string) => normalizeText(s).split(" ").filter((t) => t.length > 0);

function makeEntry(symptomId: string, display: string, rawParts: string[], order: number, red: boolean): PhraseEntry | null {
  const tokenParts = rawParts.map(words);
  const contentParts = tokenParts.map((p) => p.filter((t) => !STOPWORDS.has(t)));
  // Every part needs at least one content word.
  if (tokenParts.length === 0 || contentParts.some((p) => p.length === 0)) return null;
  const first = contentParts[0] ?? [];
  const last = contentParts[contentParts.length - 1] ?? [];
  const all = tokenParts[0] ?? [];

  let kind: PhraseEntry["kind"];
  let parts: string[][];
  if (tokenParts.length > 1) {
    kind = "gap";
    parts = tokenParts.map((p) => p.map(stem));
  } else if (first.length < 2 && all.length > first.length) {
    kind = "exact";
    parts = [all.map(stem)];
  } else {
    kind = "plain";
    parts = [first.map(stem)];
  }
  return {
    symptomId,
    phrase: display,
    kind,
    parts,
    size: contentParts.reduce((n, p) => n + p.length, 0),
    chars: parts.map((p) => p.join(" ")).join(" ").length,
    negStart: NEGATION_START.has(first[0] ?? ""),
    lastNegStart: NEGATION_START.has(last[0] ?? ""),
    red,
    order,
  };
}

function buildIndex(symptoms: readonly Symptom[]): MatcherIndex {
  const maps: Record<PhraseEntry["kind"], Map<string, PhraseEntry[]>> = {
    plain: new Map(),
    exact: new Map(),
    gap: new Map(),
  };
  let order = 0;
  for (const s of symptoms) {
    const seen = new Set<string>();
    const phrases: { display: string; parts: string[] }[] = [];
    for (const syn of s.synonyms) {
      if (isPattern(syn)) phrases.push(...expandPattern(syn));
      else phrases.push({ display: syn, parts: [syn] });
    }
    for (const plain of [s.label, s.clientLabel]) phrases.push({ display: plain, parts: [plain] });

    for (const p of phrases) {
      const entry = makeEntry(s.id, p.display, p.parts, order, !!s.redFlag);
      if (!entry) continue;
      const key = `${entry.kind}:${entry.parts.map((x) => x.join(" ")).join(` ${GAP} `)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      order++;
      const map = maps[entry.kind];
      const firstStem = entry.parts[0]?.[0] ?? "";
      const bucket = map.get(firstStem);
      if (bucket) bucket.push(entry);
      else map.set(firstStem, [entry]);
    }
  }
  return { plainByFirst: maps.plain, exactByFirst: maps.exact, gapByFirst: maps.gap };
}

function getIndex(symptoms: readonly Symptom[]): MatcherIndex {
  let idx = matcherCache.get(symptoms);
  if (!idx) {
    idx = buildIndex(symptoms);
    matcherCache.set(symptoms, idx);
  }
  return idx;
}

/* ------------------------------------------------------------------ matching */

interface Tok {
  raw: string; // lowercase normalized token
  orig: string; // same token with its original letter case (case-restricted abbreviations)
  stem: string;
  stop: boolean;
  clause: number;
}

interface Segment {
  toks: Tok[];
  content: number[]; // indexes into toks of non-stopword tokens
  group: number; // segments joined only by commas share a group
  delimAfter: string; // punctuation that ends this segment ("" at the end of the text)
}

/** A token addressed across the segments of one sentence group. */
interface FlatTok {
  seg: number;
  ti: number; // index into segments[seg].toks
}

const SEGMENT_SPLIT = /([.,;:!?\r\n]+)/;

/** Like words(), but keeps each token's original letter case alongside the lowercase form. */
function casedWords(s: string): { raw: string; orig: string }[] {
  return s
    .normalize("NFKD")
    .replace(COMBINING_MARKS, "")
    .replace(APOSTROPHES, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(" ")
    .filter((t) => t.length > 0)
    .map((orig) => ({ orig, raw: orig.toLowerCase() }));
}

function segmentize(text: string): Segment[] {
  const segments: Segment[] = [];
  let clause = 0;
  let group = 0;
  const pieces = text.normalize("NFKD").split(SEGMENT_SPLIT);
  for (let i = 0; i < pieces.length; i += 2) {
    const part = pieces[i] ?? "";
    const delimiterBefore = i > 0 ? (pieces[i - 1] ?? "") : "";
    if (delimiterBefore && !/^,+$/.test(delimiterBefore)) group++;
    const ws = casedWords(part);
    if (ws.length === 0) continue;
    clause++;
    const toks: Tok[] = [];
    const content: number[] = [];
    for (const { raw, orig } of ws) {
      if (CONTRAST_WORDS.has(raw) && toks.length > 0) clause++;
      const stop = STOPWORDS.has(raw);
      if (!stop) content.push(toks.length);
      toks.push({ raw, orig, stem: stem(raw), stop, clause });
    }
    segments.push({ toks, content, group, delimAfter: pieces[i + 1] ?? "" });
  }
  return segments;
}

interface Span {
  entry: PhraseEntry;
  seg: number; // segment of the matched (last) part
  cStart: number; // content-index range of the matched (last) part
  cEnd: number;
  rStart: number; // token range of the matched (last) part
  rEnd: number;
  anchor?: { seg: number; cStart: number; rStart: number; rEnd: number }; // first part of a gap pattern
}

interface CueHit {
  start: number;
  end: number;
  clause: number;
}

/** Every occurrence of a multi-word cue inside one clause. */
function findSequences(toks: Tok[], sequences: readonly string[][]): CueHit[] {
  const hits: CueHit[] = [];
  for (let i = 0; i < toks.length; i++) {
    for (const cue of sequences) {
      if (i + cue.length > toks.length) continue;
      let ok = true;
      for (let k = 0; k < cue.length; k++) {
        const t = toks[i + k];
        if (!t || t.raw !== cue[k]) {
          ok = false;
          break;
        }
      }
      // A cue must sit inside one clause.
      const first = toks[i];
      const last = toks[i + cue.length - 1];
      if (ok && first && last && first.clause === last.clause) hits.push({ start: i, end: i + cue.length - 1, clause: first.clause });
    }
  }
  return hits;
}

/** Does `stems` match the content tokens of `seg` starting at content index ci? */
function plainAt(seg: Segment, ci: number, stems: readonly string[]): boolean {
  if (ci + stems.length > seg.content.length) return false;
  for (let k = 0; k < stems.length; k++) {
    const ti = seg.content[ci + k];
    const t = ti === undefined ? undefined : seg.toks[ti];
    if (!t || t.stem !== stems[k]) return false;
  }
  return true;
}

/** Does `stems` match every token of `seg` starting at token index ti (stopwords included)? */
function exactAt(seg: Segment, ti: number, stems: readonly string[]): boolean {
  if (ti + stems.length > seg.toks.length) return false;
  for (let k = 0; k < stems.length; k++) if (seg.toks[ti + k]?.stem !== stems[k]) return false;
  return true;
}

/** Content-index range covered by the token range [r0, r1] (null when it holds only stopwords). */
function contentRange(seg: Segment, r0: number, r1: number): [number, number] | null {
  let lo = -1;
  let hi = -1;
  seg.content.forEach((ti, ci) => {
    if (ti >= r0 && ti <= r1) {
      if (lo < 0) lo = ci;
      hi = ci;
    }
  });
  return lo < 0 ? null : [lo, hi];
}

/**
 * Find the later parts of a gap pattern whose first part ends just before flat index `pos`.
 * Returns the token range of the last part, or null.
 */
function matchGapTail(entry: PhraseEntry, flat: FlatTok[], pos: number, segments: Segment[]): { seg: number; r0: number; r1: number } | null {
  let found: { seg: number; r0: number; r1: number } | null = null;
  for (let p = 1; p < entry.parts.length; p++) {
    const stems = entry.parts[p] ?? [];
    found = null;
    let skippedContent = 0;
    for (let at = pos; at < flat.length; at++) {
      const here = flat[at];
      const seg = here ? segments[here.seg] : undefined;
      if (!here || !seg) break;
      if (exactAt(seg, here.ti, stems)) {
        found = { seg: here.seg, r0: here.ti, r1: here.ti + stems.length - 1 };
        pos = at + stems.length;
        break;
      }
      // Skip this token: stopwords are free, content words count, a contrast word ends the search.
      const tok = seg.toks[here.ti];
      if (!tok) break;
      if (CONTRAST_WORDS.has(tok.raw)) break;
      if (!tok.stop && ++skippedContent > MAX_GAP) break;
    }
    if (!found) return null;
  }
  return found;
}

const isAllCaps = (s: string) => s !== s.toLowerCase() && s === s.toUpperCase();

/** Context for the matching passes over one text. */
class TextContext {
  readonly segments: Segment[];
  readonly flatByGroup = new Map<number, FlatTok[]>();
  readonly flatPos: number[][] = []; // [seg][ti] -> index in its group's flat list
  /** [seg][ti] -> furthest token end (same segment) of any matched span covering the token, or -1. */
  covEnd: number[][] = [];

  constructor(text: string) {
    this.segments = segmentize(text);
    this.segments.forEach((seg, si) => {
      const list = this.flatByGroup.get(seg.group) ?? [];
      this.flatPos[si] = seg.toks.map((_, ti) => list.push({ seg: si, ti }) - 1);
      this.flatByGroup.set(seg.group, list);
    });
  }

  tok(seg: number, ti: number): Tok | undefined {
    return this.segments[seg]?.toks[ti];
  }

  /** Nearest token before (dir -1) or after (dir +1) in the sentence group, skipping list separators. */
  neighbor(seg: number, ti: number, dir: -1 | 1): Tok | undefined {
    const group = this.segments[seg]?.group ?? -1;
    const flat = this.flatByGroup.get(group) ?? [];
    for (let at = (this.flatPos[seg]?.[ti] ?? 0) + dir; at >= 0 && at < flat.length; at += dir) {
      const f = flat[at];
      const t = f ? this.tok(f.seg, f.ti) : undefined;
      if (!t) return undefined;
      if (!SEPARATORS.has(t.raw)) return t;
    }
    return undefined;
  }

  /** Case-restricted one-word abbreviations ("SI", "HI", "AVH", "SOB"): capitals or a clinical neighbor. */
  abbreviationOk(entry: PhraseEntry, seg: number, ti: number): boolean {
    const stems = entry.parts[0] ?? [];
    const abbr = stems[0] ?? "";
    if (entry.kind === "gap" || stems.length !== 1 || !CASE_RESTRICTED_ABBREVIATIONS.has(abbr)) return true;
    const t = this.tok(seg, ti);
    if (!t || t.raw !== abbr) return false;
    const next = this.neighbor(seg, ti, 1);
    if (next && ABBREVIATION_NOT_BEFORE[abbr]?.has(next.raw)) return false;
    if (isAllCaps(t.orig)) return true;
    if (!CONTEXT_ABBREVIATIONS.has(abbr)) return false;
    const prev = this.neighbor(seg, ti, -1);
    return (!!prev && ABBREVIATION_NEIGHBORS.has(prev.raw)) || (!!next && ABBREVIATION_NEIGHBORS.has(next.raw));
  }

  markCovered(spans: Span[], gapSpans: Span[]): void {
    this.covEnd = this.segments.map((seg) => seg.toks.map(() => -1));
    const mark = (seg: number, r0: number, r1: number) => {
      const row = this.covEnd[seg];
      if (!row) return;
      for (let k = r0; k <= r1; k++) row[k] = Math.max(row[k] ?? -1, r1);
    };
    for (const s of spans) mark(s.seg, s.rStart, s.rEnd);
    for (const s of gapSpans) {
      mark(s.seg, s.rStart, s.rEnd);
      if (s.anchor) mark(s.anchor.seg, s.anchor.rStart, s.anchor.rEnd);
    }
  }

  covered(seg: number, ti: number): boolean {
    return (this.covEnd[seg]?.[ti] ?? -1) >= 0;
  }

  /** "and"/"or"/"then"/"now" followed within two words by a new predicate ends a cue's scope. */
  scopeBreakAt(seg: Segment, k: number): boolean {
    const t = seg.toks[k];
    if (!t || !SCOPE_BREAK_CONJ.has(t.raw)) return false;
    for (const j of [k + 1, k + 2]) {
      const n = seg.toks[j];
      if (n && n.clause === t.clause && PREDICATES.has(n.raw)) return true;
    }
    return false;
  }

  /** A strong cue earlier in the clause negates the phrase starting at rStart (see the module doc). */
  strongNegated(si: number, rStart: number, cues: CueHit[], red: boolean): boolean {
    const seg = this.segments[si];
    const clause = seg?.toks[rStart]?.clause;
    if (!seg || clause === undefined) return false;
    for (const cue of cues) {
      if (cue.clause !== clause || cue.end >= rStart) continue;
      let ok = true;
      let loose = 0;
      for (let k = cue.end + 1; k < rStart && ok; k++) {
        const t = seg.toks[k];
        if (!t || AFFIRM_STEMS.has(t.stem) || this.scopeBreakAt(seg, k)) ok = false;
        else if (red && !this.covered(si, k) && !SEPARATORS.has(t.raw)) {
          if (!(t.stop || RED_FLAG_FILLERS.has(t.raw)) || ++loose > RED_FLAG_LOOSE) ok = false;
        }
      }
      if (ok) return true;
    }
    return false;
  }

  /** A bare negator right before the phrase (stopwords and NEG_SKIP fillers may sit between). */
  bareNegated(si: number, rStart: number, negStart: boolean): boolean {
    if (negStart) return false;
    const seg = this.segments[si];
    const clause = seg?.toks[rStart]?.clause;
    if (!seg || clause === undefined) return false;
    let skipped = 0;
    for (let k = rStart - 1; k >= 0; k--) {
      const t = seg.toks[k];
      if (!t || t.clause !== clause) return false;
      const end = this.covEnd[si]?.[k] ?? -1;
      if (end >= rStart) continue; // part of an overlapping phrase over the same words
      if (end >= 0) return false; // another phrase sits in between: list spreading decides
      if (BARE_NEGATIONS.has(t.raw)) return true;
      if (SUBJECTS.has(t.raw)) return false;
      if ((t.stop || NEG_SKIP.has(t.raw)) && ++skipped <= 4) continue;
      return false;
    }
    return false;
  }

  /** "SI: denied", "HI - none", "suicidal thoughts? No.", "si/hi denied". */
  postNegated(si: number, rEnd: number): boolean {
    const seg = this.segments[si];
    if (!seg) return false;
    const tailOnly = (s: Segment, from: number) => {
      for (let k = from; k < s.toks.length; k++) {
        const t = s.toks[k];
        if (t && !t.stop && !POST_NEG_TAIL.has(t.raw)) return false;
      }
      return true;
    };
    for (let k = rEnd + 1; k < seg.toks.length; k++) {
      const t = seg.toks[k];
      if (!t) return false;
      if (this.covered(si, k) || SEPARATORS.has(t.raw) || t.stop) continue;
      return POST_NEGATIONS.has(t.raw) && tailOnly(seg, k + 1);
    }
    // The phrase ends its segment: "SI: denied" / "Suicidal thoughts? No".
    if (!/^[:?]+$/.test(seg.delimAfter.trim())) return false;
    const next = this.segments[si + 1];
    if (!next) return false;
    const firstContent = next.content[0];
    const first = firstContent === undefined ? undefined : next.toks[firstContent];
    return !!first && POST_NEGATIONS.has(first.raw) && tailOnly(next, (firstContent ?? 0) + 1);
  }

  /** Attribution cue (family history, resolved past history) that covers the phrase at rStart. */
  attributedAt(si: number, rStart: number, cues: { hit: CueHit; reason: Attribution }[]): Attribution | null {
    const seg = this.segments[si];
    const clause = seg?.toks[rStart]?.clause;
    if (!seg || clause === undefined) return null;
    for (const { hit, reason } of cues) {
      if (hit.clause !== clause || hit.end >= rStart) continue;
      let ok = true;
      for (let k = hit.end + 1; k < rStart && ok; k++) {
        const t = seg.toks[k];
        if (!t || AFFIRM_STEMS.has(t.stem) || this.scopeBreakAt(seg, k) || (SUBJECTS.has(t.raw) && k > hit.end + 1)) ok = false;
      }
      if (ok) return reason;
    }
    // Possessive relative right before the phrase: "mother's depression" -> "mothers depression".
    for (let k = rStart - 1; k >= 0; k--) {
      const t = seg.toks[k];
      if (!t || t.clause !== clause) break;
      if (t.stop) continue;
      if (t.raw.endsWith("s") && RELATIVES.has(t.raw.slice(0, -1))) return "family";
      break;
    }
    return null;
  }

  /** "depression in remission", "panic attacks have resolved". */
  remissionAfter(si: number, rEnd: number): boolean {
    const seg = this.segments[si];
    if (!seg) return false;
    for (let k = rEnd + 1; k < seg.toks.length; k++) {
      const t = seg.toks[k];
      if (!t) return false;
      if (t.stop || REMISSION_SKIP.has(t.raw)) continue;
      return REMISSION_WORDS.has(t.raw);
    }
    return false;
  }

  /** Family and history cues per segment. */
  attributionCues(si: number): { hit: CueHit; reason: Attribution }[] {
    const seg = this.segments[si];
    if (!seg) return [];
    const out: { hit: CueHit; reason: Attribution }[] = [
      ...findSequences(seg.toks, FAMILY_CUES).map((hit) => ({ hit, reason: "family" as const })),
      ...findSequences(seg.toks, HISTORY_CUES).map((hit) => ({ hit, reason: "historical" as const })),
    ];
    // "<relative> has / had / was diagnosed with ...": the cue ends at the verb.
    seg.toks.forEach((t, i) => {
      if (!RELATIVES.has(t.raw)) return;
      for (const j of [i + 1, i + 2]) {
        const n = seg.toks[j];
        if (!n || n.clause !== t.clause) break;
        if (FAMILY_VERBS.has(n.raw)) {
          out.push({ hit: { start: i, end: j, clause: t.clause }, reason: "family" });
          break;
        }
        if (!n.stop) break;
      }
    });
    return out;
  }
}

export type Attribution = "family" | "historical";

interface Placed {
  span: Span;
  group: number;
  start: number; // flat index (group) of the first token
  end: number; // flat index of the last token
  state: "positive" | "negated" | Attribution;
  /** One-word abbreviation such as SI / HI / AVH (may continue a comma list). */
  abbrev: boolean;
}

/**
 * List spreading: a negated (or attributed) phrase passes its state on to the next phrase when only
 * list words sit between them: "no SI or HI", "denies SI, HI, or AVH", "no nightmares or flashbacks".
 * Allowed in between: other matched words, separators (and/or/nor), stopwords that are not new
 * predicates, and NEG_SKIP fillers (at most 3 of those). A comma boundary passes negation on only to
 * a one-word abbreviation ("No SI, HI, AVH"), never to a whole new clause ("denies SI, avoids buses").
 * A new predicate after a conjunction ("and hears voices", "and is now spending") stops the chain.
 */
function spread(ctx: TextContext, placed: Placed[], from: "negated" | Attribution, onlyIf: (p: Placed) => boolean): void {
  const order = [...placed].sort((a, b) => a.group - b.group || a.start - b.start || a.end - b.end);
  let chainEnd = -1;
  let chainGroup = -1;
  for (const p of order) {
    if (p.group !== chainGroup) {
      chainGroup = p.group;
      chainEnd = -1;
    }
    if (p.state === from) {
      chainEnd = Math.max(chainEnd, p.end);
      continue;
    }
    if (chainEnd < 0 || p.start <= chainEnd) continue; // no chain, or the same words as the chain
    const flat = ctx.flatByGroup.get(p.group) ?? [];
    let ok = p.state === "positive" && onlyIf(p);
    let loose = 0;
    let crossesComma = false;
    for (let at = chainEnd; ok && at < p.start; at++) {
      const a = flat[at];
      const b = flat[at + 1];
      if (a && b && a.seg !== b.seg) crossesComma = true;
      if (at === chainEnd) continue;
      const t = a ? ctx.tok(a.seg, a.ti) : undefined;
      const seg = a ? ctx.segments[a.seg] : undefined;
      if (!a || !t || !seg) ok = false;
      else if (ctx.covered(a.seg, a.ti)) continue;
      else if (CONTRAST_WORDS.has(t.raw) || AFFIRM_STEMS.has(t.stem) || PREDICATES.has(t.raw) || ctx.scopeBreakAt(seg, a.ti)) ok = false;
      else if (SEPARATORS.has(t.raw)) continue;
      else if (!((t.stop || NEG_SKIP.has(t.raw)) && ++loose <= 3)) ok = false;
    }
    if (ok && crossesComma && from === "negated" && !p.abbrev) ok = false;
    if (ok) {
      p.state = from;
      chainEnd = Math.max(chainEnd, p.end);
    } else {
      chainEnd = -1;
    }
  }
}

/** Map free text to lexicon symptom ids, splitting positive, negated and attributed mentions. Deterministic. */
export function matchSymptoms(text: string, symptoms: Symptom[]): MatchResult {
  if (!text || symptoms.length === 0) return { matches: [], negated: [], attributed: [] };
  const index = getIndex(symptoms);
  const ctx = new TextContext(text);
  const { segments, flatByGroup, flatPos } = ctx;

  // 1. Every candidate phrase occurrence. Gap patterns are collected apart (non-consuming).
  const candidates: Span[] = [];
  const gapSpans: Span[] = [];
  segments.forEach((seg, si) => {
    // Plain phrases: over content tokens.
    for (let ci = 0; ci < seg.content.length; ci++) {
      const firstIdx = seg.content[ci];
      const first = firstIdx === undefined ? undefined : seg.toks[firstIdx];
      const bucket = first ? index.plainByFirst.get(first.stem) : undefined;
      if (!bucket || firstIdx === undefined) continue;
      for (const entry of bucket) {
        const stems = entry.parts[0] ?? [];
        if (!plainAt(seg, ci, stems) || !ctx.abbreviationOk(entry, si, firstIdx)) continue;
        const cEnd = ci + stems.length - 1;
        candidates.push({ entry, seg: si, cStart: ci, cEnd, rStart: firstIdx, rEnd: seg.content[cEnd] ?? 0 });
      }
    }
    // Word-for-word phrases and gap patterns: over all tokens.
    for (let ti = 0; ti < seg.toks.length; ti++) {
      const tok = seg.toks[ti];
      if (!tok) continue;
      for (const entry of index.exactByFirst.get(tok.stem) ?? []) {
        const stems = entry.parts[0] ?? [];
        if (!exactAt(seg, ti, stems) || !ctx.abbreviationOk(entry, si, ti)) continue;
        const range = contentRange(seg, ti, ti + stems.length - 1);
        if (range) candidates.push({ entry, seg: si, cStart: range[0], cEnd: range[1], rStart: ti, rEnd: ti + stems.length - 1 });
      }
      for (const entry of index.gapByFirst.get(tok.stem) ?? []) {
        const head = entry.parts[0] ?? [];
        if (!exactAt(seg, ti, head)) continue;
        const headRange = contentRange(seg, ti, ti + head.length - 1);
        const flat = flatByGroup.get(seg.group) ?? [];
        const tail = matchGapTail(entry, flat, (flatPos[si]?.[ti] ?? 0) + head.length, segments);
        const tailSeg = tail ? segments[tail.seg] : undefined;
        const tailRange = tail && tailSeg ? contentRange(tailSeg, tail.r0, tail.r1) : null;
        if (!tail || !headRange || !tailRange) continue;
        gapSpans.push({
          entry,
          seg: tail.seg,
          cStart: tailRange[0],
          cEnd: tailRange[1],
          rStart: tail.r0,
          rEnd: tail.r1,
          anchor: { seg: si, cStart: headRange[0], rStart: ti, rEnd: ti + head.length - 1 },
        });
      }
    }
  });

  // 2. Longest phrase wins on overlap (plain and word-for-word phrases only).
  candidates.sort(
    (a, b) =>
      b.entry.size - a.entry.size ||
      b.entry.chars - a.entry.chars ||
      a.seg - b.seg ||
      a.cStart - b.cStart ||
      a.entry.order - b.entry.order,
  );
  const accepted: Span[] = [];
  for (const c of candidates) {
    const overlaps = accepted.some((a) => a.seg === c.seg && a.cStart <= c.cEnd && c.cStart <= a.cEnd);
    if (!overlaps) accepted.push(c);
  }
  ctx.markCovered(accepted, gapSpans);

  // 3. Negation, then attribution, per mention.
  const cuesBySeg = segments.map((seg, si) => {
    const inside = accepted.filter((a) => a.seg === si);
    return findSequences(seg.toks, CUE_TOKENS).filter((cue) => !inside.some((a) => cue.start <= a.rEnd && a.rStart <= cue.end));
  });
  const attribBySeg = segments.map((_, si) => ctx.attributionCues(si));
  const all = [...accepted, ...gapSpans].sort(
    (a, b) => a.seg - b.seg || a.cStart - b.cStart || a.entry.order - b.entry.order,
  );

  const negatedHere = (si: number, rStart: number, negStart: boolean, red: boolean) =>
    ctx.strongNegated(si, rStart, cuesBySeg[si] ?? [], red) || ctx.bareNegated(si, rStart, negStart);

  const placed: Placed[] = all.map((span) => {
    const red = span.entry.red;
    const headSeg = span.anchor ? span.anchor.seg : span.seg;
    const headStart = span.anchor ? span.anchor.rStart : span.rStart;
    let neg: boolean;
    if (span.anchor) {
      neg =
        negatedHere(span.anchor.seg, span.anchor.rStart, span.entry.negStart, red) ||
        negatedHere(span.seg, span.rStart, span.entry.lastNegStart, red);
    } else {
      neg = negatedHere(span.seg, span.rStart, span.entry.negStart, red);
    }
    if (!neg) neg = ctx.postNegated(span.seg, span.rEnd);

    let state: Placed["state"] = neg ? "negated" : "positive";
    if (!neg && !red) {
      const reason =
        ctx.attributedAt(headSeg, headStart, attribBySeg[headSeg] ?? []) ??
        (ctx.remissionAfter(span.seg, span.rEnd) ? "historical" : null);
      if (reason) state = reason;
    }
    const stems = span.entry.parts[0] ?? [];
    return {
      span,
      group: segments[span.seg]?.group ?? 0,
      start: flatPos[headSeg]?.[headStart] ?? 0,
      end: flatPos[span.seg]?.[span.rEnd] ?? 0,
      state,
      abbrev: span.entry.kind !== "gap" && stems.length === 1 && CASE_RESTRICTED_ABBREVIATIONS.has(stems[0] ?? ""),
    };
  });
  spread(ctx, placed, "negated", (p) => !(p.span.anchor ? p.span.entry.lastNegStart : p.span.entry.negStart));
  spread(ctx, placed, "family", (p) => !p.span.entry.red);
  spread(ctx, placed, "historical", (p) => !p.span.entry.red);

  // 4. One entry per symptom: positive wins over negated, negated over attributed.
  placed.sort((a, b) => a.span.seg - b.span.seg || a.span.cStart - b.span.cStart || a.span.entry.order - b.span.entry.order);
  const positive = new Map<string, SymptomMatch>();
  const negative = new Map<string, SymptomMatch>();
  const attributed = new Map<string, AttributedMatch>();
  for (const p of placed) {
    const hit: SymptomMatch = { symptomId: p.span.entry.symptomId, phrase: p.span.entry.phrase };
    if (p.state === "positive") {
      if (!positive.has(hit.symptomId)) positive.set(hit.symptomId, hit);
    } else if (p.state === "negated") {
      if (!negative.has(hit.symptomId)) negative.set(hit.symptomId, hit);
    } else if (!attributed.has(hit.symptomId)) {
      attributed.set(hit.symptomId, { ...hit, reason: p.state });
    }
  }
  return {
    matches: [...positive.values()],
    negated: [...negative.values()].filter((n) => !positive.has(n.symptomId)),
    attributed: [...attributed.values()].filter((n) => !positive.has(n.symptomId) && !negative.has(n.symptomId)),
  };
}

/* ------------------------------------------------------------------ chip search */

/**
 * One Fuse document per phrase (label, clientLabel, each synonym), not per symptom. Fuse multiplies
 * per-key scores, so a per-symptom record that fuzzily hits several fields would outrank a symptom
 * with one near-exact synonym; scoring each phrase on its own and keeping each symptom's best phrase
 * avoids that ("cant slep" -> insomnia first). Gap patterns are matcher syntax, not chip text.
 */
interface SearchDoc {
  idx: number; // index into the symptoms array
  text: string; // normalized phrase
}

const fuseCache = new WeakMap<readonly Symptom[], Fuse<SearchDoc>>();

function getFuse(symptoms: readonly Symptom[]): Fuse<SearchDoc> {
  let fuse = fuseCache.get(symptoms);
  if (!fuse) {
    const docs: SearchDoc[] = [];
    symptoms.forEach((s, idx) => {
      for (const phrase of [s.label, s.clientLabel, ...s.synonyms.filter((p) => !isPattern(p))]) {
        const text = normalizeText(phrase);
        if (text) docs.push({ idx, text });
      }
    });
    fuse = new Fuse(docs, { keys: ["text"], threshold: 0.35, ignoreLocation: true, shouldSort: true });
    fuseCache.set(symptoms, fuse);
  }
  return fuse;
}

/** Fuzzy search for the symptom chip box (label, clientLabel, synonyms). Empty query => []. */
export function searchSymptoms(query: string, symptoms: Symptom[], limit = 8): Symptom[] {
  const q = normalizeText(query);
  if (!q || limit <= 0 || symptoms.length === 0) return [];
  const out: Symptom[] = [];
  const seen = new Set<number>();
  for (const r of getFuse(symptoms).search(q)) {
    if (seen.has(r.item.idx)) continue;
    seen.add(r.item.idx);
    const s = symptoms[r.item.idx];
    if (s) out.push(s);
    if (out.length >= limit) break;
  }
  return out;
}
