/**
 * Explainable, deterministic symptom matcher (spec section 4).
 * Pure functions over memory-only data: nothing passed in is stored, logged or sent anywhere (G5).
 * Callers must run the PHI scrubber on free text before calling matchSymptoms.
 *
 * matchSymptoms(text, symptoms) pipeline:
 *  1. Segments: the text is split at . , ; : ! ? and line breaks. A phrase never spans two segments.
 *  2. Tokens: each segment is normalized (normalizeText) and split on spaces. Every token gets a light
 *     stem (stem(): -ing / -ed / -ly / -s(-es), then trailing e, y->i, ck->c, doubled consonant) and a
 *     stopword flag (STOPWORDS). Contrast words (but, however, although, though, except, whereas) start a
 *     new negation clause; so does every new segment.
 *  3. Phrases: each symptom's label, clientLabel and synonyms are normalized and stemmed the same way,
 *     with stopwords removed. A phrase matches when its stems appear as a contiguous run of NON-stopword
 *     tokens in one segment ("cant leave my house" ~ "cant leave the house", "worrying" ~ "worry").
 *  4. Overlap: the longest phrase wins (most non-stopword tokens, then most characters); ties go to the
 *     earlier position, then lexicon order. Spans are taken greedily and never overlap.
 *  5. Negation (deliberately conservative: a missed negation shows one extra item for clinician review,
 *     a wrong negation could hide a red flag):
 *     - strong cues (STRONG_NEGATION_CUES: "denies", "negative for", "no history of", ...) negate every
 *       phrase that starts later in the SAME clause, unless an affirming verb (reports, endorses,
 *       describes, admits, complains) sits between the cue and the phrase. A cue inside a matched phrase
 *       is ignored. Cues AFTER a phrase never negate it.
 *     - bare "no" / "not" / "never" negates only when it is the non-stopword token immediately before
 *       the phrase, in the same clause, and the phrase itself does not begin with a negation
 *       (so "no interest in anything" stays a positive match, "no nightmares" is negated,
 *       "no si or hi" negates only si).
 *  6. One entry per symptomId. A symptom is positive if ANY mention is positive and negated only when
 *     every mention is negated; matches and negated never share an id. Results are in order of first
 *     mention. `phrase` is the lexicon phrase (synonym, label or clientLabel) that matched, as written.
 *
 * searchSymptoms(query, symptoms) is a fuzzy chip search (Fuse.js) over label, clientLabel, synonyms.
 * Indexes for both functions are built lazily and cached per symptoms array (WeakMap).
 */
import Fuse from "fuse.js";
import type { Symptom } from "./schemas";

export interface SymptomMatch {
  symptomId: string;
  phrase: string;
}

export interface MatchResult {
  matches: SymptomMatch[];
  negated: SymptomMatch[];
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
 * Light, consistent stemmer. It does not aim for dictionary words, only for the same output on both
 * sides: worry / worries / worried / worrying -> "worri"; panic / panics / panicked / panicking -> "panic".
 */
export function stem(token: string): string {
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

/** Ignored on both sides when matching phrases. Never contains negation words. */
export const STOPWORDS: ReadonlySet<string> = new Set([
  "the", "a", "an", "my", "his", "her", "their", "our", "your", "its",
  "of", "to", "in", "at", "on", "about", "for", "with", "from", "by",
  "really", "very", "so", "just", "quite", "too", "also",
  "this", "that", "these", "those", "there", "any", "some",
  "is", "am", "are", "was", "were", "be", "been", "being",
  "i", "im", "ive", "me", "myself", "he", "hes", "him", "she", "shes", "they", "theyre", "them",
  "we", "you", "youre", "it",
  "do", "does", "did", "have", "has", "had", "having",
]);

const CONTRAST_WORDS = new Set(["but", "however", "although", "though", "except", "whereas"]);
const BARE_NEGATIONS = new Set(["no", "not", "never"]);
/** A phrase starting with one of these is itself a negative statement ("no interest in anything"). */
const NEGATION_START = new Set([
  "no", "not", "never", "none", "nothing", "nobody", "cant", "cannot", "dont", "doesnt", "didnt",
  "wont", "isnt", "arent", "wasnt", "havent", "hasnt", "hadnt", "couldnt", "unable", "without",
]);

/** Strong negation cues (normalized, unstemmed word sequences). Scope: the rest of the clause. */
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

/* ------------------------------------------------------------------ index */

interface PhraseEntry {
  symptomId: string;
  phrase: string;
  stems: string[];
  chars: number;
  negStart: boolean;
  order: number;
}

interface MatcherIndex {
  byFirst: Map<string, PhraseEntry[]>;
}

const matcherCache = new WeakMap<readonly Symptom[], MatcherIndex>();

function contentTokens(phrase: string): string[] {
  return normalizeText(phrase)
    .split(" ")
    .filter((t) => t.length > 0 && !STOPWORDS.has(t));
}

function buildIndex(symptoms: readonly Symptom[]): MatcherIndex {
  const byFirst = new Map<string, PhraseEntry[]>();
  let order = 0;
  for (const s of symptoms) {
    const seen = new Set<string>();
    for (const phrase of [...s.synonyms, s.label, s.clientLabel]) {
      const raw = contentTokens(phrase);
      if (raw.length === 0) continue;
      const stems = raw.map(stem);
      const key = stems.join(" ");
      if (seen.has(key)) continue;
      seen.add(key);
      const entry: PhraseEntry = {
        symptomId: s.id,
        phrase,
        stems,
        chars: key.length,
        negStart: NEGATION_START.has(raw[0] ?? ""),
        order: order++,
      };
      const first = stems[0] ?? "";
      const bucket = byFirst.get(first);
      if (bucket) bucket.push(entry);
      else byFirst.set(first, [entry]);
    }
  }
  return { byFirst };
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
  raw: string;
  stem: string;
  stop: boolean;
  clause: number;
}

interface Segment {
  toks: Tok[];
  content: number[]; // indexes into toks of non-stopword tokens
}

const SEGMENT_BREAK = /[.,;:!?\r\n]+/;

function segmentize(text: string): Segment[] {
  const segments: Segment[] = [];
  let clause = 0;
  for (const part of text.normalize("NFKD").split(SEGMENT_BREAK)) {
    const words = normalizeText(part).split(" ").filter((w) => w.length > 0);
    if (words.length === 0) continue;
    clause++;
    const toks: Tok[] = [];
    const content: number[] = [];
    for (const raw of words) {
      if (CONTRAST_WORDS.has(raw) && toks.length > 0) clause++;
      const stop = STOPWORDS.has(raw);
      if (!stop) content.push(toks.length);
      toks.push({ raw, stem: stem(raw), stop, clause });
    }
    segments.push({ toks, content });
  }
  return segments;
}

interface Span {
  entry: PhraseEntry;
  seg: number;
  cStart: number; // index into segment.content
  cEnd: number;
  rStart: number; // index into segment.toks
  rEnd: number;
}

interface CueHit {
  start: number;
  end: number;
  clause: number;
}

function findCues(toks: Tok[]): CueHit[] {
  const hits: CueHit[] = [];
  for (let i = 0; i < toks.length; i++) {
    for (const cue of CUE_TOKENS) {
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

function isNegated(span: Span, seg: Segment, cues: CueHit[]): boolean {
  const startTok = seg.toks[span.rStart];
  if (!startTok) return false;
  const clause = startTok.clause;
  for (const cue of cues) {
    if (cue.clause !== clause || cue.end >= span.rStart) continue;
    let affirmed = false;
    for (let k = cue.end + 1; k < span.rStart; k++) {
      const t = seg.toks[k];
      if (t && AFFIRM_STEMS.has(t.stem)) {
        affirmed = true;
        break;
      }
    }
    if (!affirmed) return true;
  }
  if (!span.entry.negStart && span.cStart > 0) {
    const prevIdx = seg.content[span.cStart - 1];
    const prev = prevIdx === undefined ? undefined : seg.toks[prevIdx];
    if (prev && prev.clause === clause && BARE_NEGATIONS.has(prev.raw)) return true;
  }
  return false;
}

/** Map free text to lexicon symptom ids, splitting positive and negated mentions. Deterministic. */
export function matchSymptoms(text: string, symptoms: Symptom[]): MatchResult {
  if (!text || symptoms.length === 0) return { matches: [], negated: [] };
  const index = getIndex(symptoms);
  const segments = segmentize(text);

  // 1. Every candidate phrase occurrence.
  const candidates: Span[] = [];
  segments.forEach((seg, si) => {
    for (let ci = 0; ci < seg.content.length; ci++) {
      const firstIdx = seg.content[ci];
      const first = firstIdx === undefined ? undefined : seg.toks[firstIdx];
      const bucket = first ? index.byFirst.get(first.stem) : undefined;
      if (!bucket) continue;
      for (const entry of bucket) {
        const n = entry.stems.length;
        if (ci + n > seg.content.length) continue;
        let ok = true;
        for (let k = 1; k < n; k++) {
          const ti = seg.content[ci + k];
          const t = ti === undefined ? undefined : seg.toks[ti];
          if (!t || t.stem !== entry.stems[k]) {
            ok = false;
            break;
          }
        }
        if (!ok) continue;
        candidates.push({
          entry,
          seg: si,
          cStart: ci,
          cEnd: ci + n - 1,
          rStart: seg.content[ci] ?? 0,
          rEnd: seg.content[ci + n - 1] ?? 0,
        });
      }
    }
  });

  // 2. Longest phrase wins on overlap.
  candidates.sort(
    (a, b) =>
      b.entry.stems.length - a.entry.stems.length ||
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
  accepted.sort((a, b) => a.seg - b.seg || a.cStart - b.cStart);

  // 3. Negation, then one entry per symptom (positive wins over negated).
  const cuesBySeg = segments.map((seg, si) => {
    const inside = accepted.filter((a) => a.seg === si);
    return findCues(seg.toks).filter((cue) => !inside.some((a) => cue.start <= a.rEnd && a.rStart <= cue.end));
  });
  const positive = new Map<string, SymptomMatch>();
  const negative = new Map<string, SymptomMatch>();
  for (const span of accepted) {
    const seg = segments[span.seg];
    if (!seg) continue;
    const hit: SymptomMatch = { symptomId: span.entry.symptomId, phrase: span.entry.phrase };
    if (isNegated(span, seg, cuesBySeg[span.seg] ?? [])) {
      if (!negative.has(hit.symptomId)) negative.set(hit.symptomId, hit);
    } else if (!positive.has(hit.symptomId)) {
      positive.set(hit.symptomId, hit);
    }
  }
  return {
    matches: [...positive.values()],
    negated: [...negative.values()].filter((n) => !positive.has(n.symptomId)),
  };
}

/* ------------------------------------------------------------------ chip search */

/**
 * One Fuse document per phrase (label, clientLabel, each synonym), not per symptom. Fuse multiplies
 * per-key scores, so a per-symptom record that fuzzily hits several fields would outrank a symptom
 * with one near-exact synonym; scoring each phrase on its own and keeping each symptom's best phrase
 * avoids that ("cant slep" -> insomnia first).
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
      for (const phrase of [s.label, s.clientLabel, ...s.synonyms]) {
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
