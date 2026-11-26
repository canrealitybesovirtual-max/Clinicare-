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
 *     - strong cues (STRONG_NEGATION_CUES: "denies", "negative for", "no history of", ...) negate every
 *       phrase that starts later in the SAME clause, unless an affirming verb (reports, endorses,
 *       describes, admits, complains) sits between the cue and the phrase. A cue inside a matched phrase
 *       is ignored. Cues AFTER a phrase never negate it.
 *     - bare "no" / "not" / "never" negates only when it is the non-stopword token immediately before
 *       the phrase, in the same clause, and the phrase itself does not begin with a negation
 *       (so "no interest in anything" stays a positive match, "no nightmares" is negated,
 *       "no si or hi" negates only si).
 *     - a gap pattern is negated when either its first part (A) or its matched part (B) is negated.
 *  6. One entry per symptomId. A symptom is positive if ANY mention is positive and negated only when
 *     every mention is negated; matches and negated never share an id. Results are in order of first
 *     mention. `phrase` is the lexicon phrase (synonym, label or clientLabel) that matched, as written.
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

function makeEntry(symptomId: string, display: string, rawParts: string[], order: number): PhraseEntry | null {
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
      const entry = makeEntry(s.id, p.display, p.parts, order);
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
  raw: string;
  stem: string;
  stop: boolean;
  clause: number;
}

interface Segment {
  toks: Tok[];
  content: number[]; // indexes into toks of non-stopword tokens
  group: number; // segments joined only by commas share a group
}

/** A token addressed across the segments of one sentence group. */
interface FlatTok {
  seg: number;
  ti: number; // index into segments[seg].toks
}

const SEGMENT_SPLIT = /([.,;:!?\r\n]+)/;

function segmentize(text: string): Segment[] {
  const segments: Segment[] = [];
  let clause = 0;
  let group = 0;
  const pieces = text.normalize("NFKD").split(SEGMENT_SPLIT);
  for (let i = 0; i < pieces.length; i += 2) {
    const part = pieces[i] ?? "";
    const delimiterBefore = i > 0 ? (pieces[i - 1] ?? "") : "";
    if (delimiterBefore && !/^,+$/.test(delimiterBefore)) group++;
    const ws = words(part);
    if (ws.length === 0) continue;
    clause++;
    const toks: Tok[] = [];
    const content: number[] = [];
    for (const raw of ws) {
      if (CONTRAST_WORDS.has(raw) && toks.length > 0) clause++;
      const stop = STOPWORDS.has(raw);
      if (!stop) content.push(toks.length);
      toks.push({ raw, stem: stem(raw), stop, clause });
    }
    segments.push({ toks, content, group });
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
  anchor?: { seg: number; cStart: number; rStart: number }; // first part of a gap pattern
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

function negatedAt(seg: Segment, rStart: number, cStart: number, negStart: boolean, cues: CueHit[]): boolean {
  const startTok = seg.toks[rStart];
  if (!startTok) return false;
  const clause = startTok.clause;
  for (const cue of cues) {
    if (cue.clause !== clause || cue.end >= rStart) continue;
    let affirmed = false;
    for (let k = cue.end + 1; k < rStart; k++) {
      const t = seg.toks[k];
      if (t && AFFIRM_STEMS.has(t.stem)) {
        affirmed = true;
        break;
      }
    }
    if (!affirmed) return true;
  }
  if (!negStart && cStart > 0) {
    const prevIdx = seg.content[cStart - 1];
    const prev = prevIdx === undefined ? undefined : seg.toks[prevIdx];
    if (prev && prev.clause === clause && BARE_NEGATIONS.has(prev.raw)) return true;
  }
  return false;
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

/** Map free text to lexicon symptom ids, splitting positive and negated mentions. Deterministic. */
export function matchSymptoms(text: string, symptoms: Symptom[]): MatchResult {
  if (!text || symptoms.length === 0) return { matches: [], negated: [] };
  const index = getIndex(symptoms);
  const segments = segmentize(text);

  // Flattened tokens per sentence group (for gap patterns).
  const flatByGroup = new Map<number, FlatTok[]>();
  const flatPos: number[][] = []; // [seg][ti] -> index in its group's flat list
  segments.forEach((seg, si) => {
    const list = flatByGroup.get(seg.group) ?? [];
    flatPos[si] = seg.toks.map((_, ti) => list.push({ seg: si, ti }) - 1);
    flatByGroup.set(seg.group, list);
  });

  // 1. Every candidate phrase occurrence. Gap patterns are collected apart (non-consuming).
  const candidates: Span[] = [];
  const gapSpans: Span[] = [];
  segments.forEach((seg, si) => {
    // Plain phrases: over content tokens.
    for (let ci = 0; ci < seg.content.length; ci++) {
      const firstIdx = seg.content[ci];
      const first = firstIdx === undefined ? undefined : seg.toks[firstIdx];
      const bucket = first ? index.plainByFirst.get(first.stem) : undefined;
      if (!bucket) continue;
      for (const entry of bucket) {
        const stems = entry.parts[0] ?? [];
        if (!plainAt(seg, ci, stems)) continue;
        const cEnd = ci + stems.length - 1;
        candidates.push({ entry, seg: si, cStart: ci, cEnd, rStart: seg.content[ci] ?? 0, rEnd: seg.content[cEnd] ?? 0 });
      }
    }
    // Word-for-word phrases and gap patterns: over all tokens.
    for (let ti = 0; ti < seg.toks.length; ti++) {
      const tok = seg.toks[ti];
      if (!tok) continue;
      for (const entry of index.exactByFirst.get(tok.stem) ?? []) {
        const stems = entry.parts[0] ?? [];
        if (!exactAt(seg, ti, stems)) continue;
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
          anchor: { seg: si, cStart: headRange[0], rStart: ti },
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

  // 3. Negation, then one entry per symptom (positive wins over negated).
  const cuesBySeg = segments.map((seg, si) => {
    const inside = accepted.filter((a) => a.seg === si);
    return findCues(seg.toks).filter((cue) => !inside.some((a) => cue.start <= a.rEnd && a.rStart <= cue.end));
  });
  const all = [...accepted, ...gapSpans].sort(
    (a, b) => a.seg - b.seg || a.cStart - b.cStart || a.entry.order - b.entry.order,
  );
  const positive = new Map<string, SymptomMatch>();
  const negative = new Map<string, SymptomMatch>();
  for (const span of all) {
    const seg = segments[span.seg];
    if (!seg) continue;
    const hit: SymptomMatch = { symptomId: span.entry.symptomId, phrase: span.entry.phrase };
    let neg: boolean;
    if (span.anchor) {
      const aSeg = segments[span.anchor.seg];
      neg =
        (aSeg !== undefined &&
          negatedAt(aSeg, span.anchor.rStart, span.anchor.cStart, span.entry.negStart, cuesBySeg[span.anchor.seg] ?? [])) ||
        negatedAt(seg, span.rStart, span.cStart, span.entry.lastNegStart, cuesBySeg[span.seg] ?? []);
    } else {
      neg = negatedAt(seg, span.rStart, span.cStart, span.entry.negStart, cuesBySeg[span.seg] ?? []);
    }
    if (neg) {
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
