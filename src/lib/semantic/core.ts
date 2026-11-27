/**
 * Pure core of the on-device semantic matcher (docs/ON-DEVICE-AI.md). No I/O, no logging, no globals:
 * the same functions run in the Web Worker (browser) and in Node (build script, tests), so what the
 * tests measure is what the clinician gets.
 *
 * Pipeline for semanticSuggest(text):
 *  1. splitSegments(): the (already PHI-scrubbed) text is cut into sentences and, inside each sentence,
 *     into clauses at commas and joining words (and, but, because, ...). Every clause becomes a segment;
 *     a sentence with several clauses is also kept whole, for context. Scrubber placeholders ("[NAME]")
 *     are dropped first. Negation is handled conservatively:
 *       - strong cues from the deterministic matcher ("denies", "negative for", "no history of", ...)
 *         drop the clause and the clauses after it in the same sentence, until a contrast word ("but")
 *         or a new statement ("has", "reports", "she") ends the cue's scope;
 *       - a clause with a bare negator ("no", "not", "never", "can't", ...) is marked `negated`: it may
 *         only match lexicon phrases that are negative themselves ("no interest", "can't sleep"), so
 *         "no nightmares" never suggests nightmares while "no interest in anything" still finds anhedonia.
 *  2. The worker embeds each segment with all-MiniLM-L6-v2 (mean pooling, L2-normalized).
 *  3. rankSuggestions(): cosine similarity against every lexicon phrase (label pieces, plain-language
 *     label, synonyms, expanded gap patterns). A symptom's score is its best (segment, phrase) pair.
 *     Symptoms in `exclude` are skipped; scores below `threshold` are dropped; ties break on id.
 *
 * Output is a list of curated lexicon ids for the clinician to tap and add. Nothing is added on its own,
 * no diagnosis or risk decision is made, and nothing leaves the device.
 */
import { STRONG_NEGATION_CUES, normalizeText } from "../matcher";
import type { Symptom } from "../schemas";
import { LEXICON_EMBEDDINGS_FORMAT, MODEL_DIMS, MODEL_NAME, MODEL_REVISION } from "./model";

/* ------------------------------------------------------------------ */
/* Tunables                                                            */
/* ------------------------------------------------------------------ */

/**
 * Cosine-similarity cut-off, calibrated on SEMANTIC_CALIBRATION_SET (src/lib/semantic/calibration.ts;
 * report: `npx tsx scripts/build-lexicon-embeddings.ts --calibrate`). See docs/ON-DEVICE-AI.md.
 * Re-calibrated for lexicon 1.3.0 (104 symptoms, 2627 phrases): at 0.50 the larger phrase set let neutral texts
 * through (negatives clean 0.8); 0.60 keeps every negative text clean with recall above 0.8. Re-run the report and
 * revisit this value whenever the lexicon grows.
 */
export const DEFAULT_THRESHOLD = 0.6;
/**
 * Per-segment margin: within one segment, only symptoms scoring at least (segment best - margin) are
 * kept. A strong, specific match ("hot flashes" -> heat/chill sensations, 0.99) then hides the loose
 * neighbours that share a word or a vague theme, while separate clauses keep their own best matches.
 */
export const DEFAULT_MARGIN = 0.08;
/** Negated segments: how far below their best match over all phrases (any polarity) a score may be. */
export const NEGATED_MARGIN = 0.2;
export const DEFAULT_LIMIT = 5;
export const MAX_LIMIT = 20;
/** Upper bounds that keep one call fast on a low-end laptop. */
export const MAX_INPUT_CHARS = 6000;
export const MAX_SEGMENTS = 40;
export const MAX_SEGMENT_WORDS = 48;

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export interface SemanticSuggestion {
  /** Curated lexicon id (content/symptoms.json). */
  symptomId: string;
  /** Cosine similarity, 0-1, rounded to 3 decimals. */
  score: number;
  /** The lexicon phrase it was closest to, as written in the lexicon (or an expanded gap pattern). */
  phrase: string;
  /** The part of the clinician's (scrubbed) text it matched. Memory-only, never sent anywhere. */
  clause: string;
}

export interface SuggestOptions {
  /** Symptom ids to leave out (already selected chips, deterministic matches). */
  exclude?: readonly string[];
  /** Minimum score, 0-1. Default DEFAULT_THRESHOLD. */
  threshold?: number;
  /** Maximum number of suggestions, 1-MAX_LIMIT. Default DEFAULT_LIMIT. */
  limit?: number;
  /** Per-segment margin, 0-1 (see DEFAULT_MARGIN). Default DEFAULT_MARGIN; 1 turns it off. */
  margin?: number;
}

export interface Segment {
  /** Display text: the clause as typed (scrubbed), whitespace collapsed. */
  clause: string;
  /** Text given to the model (prepareText). */
  text: string;
  /** Contains a bare negator: may only match negative lexicon phrases. */
  negated: boolean;
}

/** public/models/lexicon-embeddings.json */
export interface LexiconEmbeddingsFile {
  format: typeof LEXICON_EMBEDDINGS_FORMAT;
  model: string;
  revision: string;
  dims: number;
  /** "int8-hex": each vector is L2-normalized, scaled so max |x| = 127, rounded, two's-complement hex. */
  encoding: "int8-hex";
  lexiconVersion: string;
  /** SHA-256 of the phrase list (ids + phrases) and model revision: detects a stale file. */
  lexiconSha256: string;
  generatedBy: string;
  symptoms: { id: string; phrases: string[]; vectors: string[] }[];
}

export interface LexiconIndexEntry {
  symptomId: string;
  phrases: string[];
  /** 1 when the phrase itself is negative ("no interest", "can't sleep"). */
  negative: Uint8Array;
  /** phrases.length rows of `dims` floats, each row unit length. */
  vectors: Float32Array;
}

export interface LexiconIndex {
  dims: number;
  entries: LexiconIndexEntry[];
  phraseCount: number;
}

/* ------------------------------------------------------------------ */
/* Text preparation                                                    */
/* ------------------------------------------------------------------ */

/** Apostrophe-free contractions (normalizeText drops apostrophes) spelled out for the model. */
const CONTRACTIONS: Readonly<Record<string, string>> = {
  cant: "can not", cannot: "can not", dont: "do not", doesnt: "does not", didnt: "did not",
  wont: "will not", isnt: "is not", arent: "are not", wasnt: "was not", werent: "were not",
  havent: "have not", hasnt: "has not", hadnt: "had not", couldnt: "could not", shouldnt: "should not",
  wouldnt: "would not", aint: "is not", im: "i am", ive: "i have", youre: "you are", theyre: "they are",
  hes: "he is", shes: "she is", thats: "that is", whats: "what is", theres: "there is",
};

/** Lowercase, strip accents and punctuation (normalizeText), then spell out contractions. */
export function prepareText(s: string): string {
  const norm = normalizeText(s);
  if (!norm) return "";
  return norm
    .split(" ")
    .map((t) => CONTRACTIONS[t] ?? t)
    .join(" ");
}

/** Bare negators, checked on prepareText() output (so "can't" has become "can not"). */
const NEGATORS: ReadonlySet<string> = new Set([
  "no", "not", "never", "without", "nothing", "none", "nor", "neither", "nobody", "nowhere", "unable",
]);

/** Idioms that contain a negator but do not negate the symptom ("panic for no reason", "out of nowhere"). */
const NON_NEGATING = /\b(?:(?:over|about|for) (?:nothing|no reason)|for no (?:apparent |obvious |real )?reason|no (?:apparent |obvious )?reason|without (?:any )?(?:warning|reason|a reason|a trigger)|no (?:warning|trigger)|out of nowhere|nowhere to (?:go|run|hide)|no way out|no escape)\b/g;

export function isNegative(prepared: string): boolean {
  for (const t of prepared.replace(NON_NEGATING, " ").split(" ")) if (NEGATORS.has(t)) return true;
  return false;
}

/** Short function words: a segment needs at least one word of 4+ letters that is not one of these. */
const FUNCTION_WORDS: ReadonlySet<string> = new Set([
  "with", "from", "that", "this", "then", "also", "very", "really", "just", "about", "have", "been",
  "being", "into", "over", "some", "more", "most", "much", "when", "what", "where", "which", "while",
  "they", "them", "their", "there", "here", "were", "your", "will", "would", "could", "should", "does",
  "each", "even", "only", "still", "than", "those", "these", "said", "says", "states", "reports",
  "client", "patient", "today", "week", "weeks", "time", "times", "thing", "things",
]);

function hasContent(prepared: string): boolean {
  return prepared.split(" ").some((t) => t.length >= 4 && !FUNCTION_WORDS.has(t) && !/^\d+$/.test(t));
}

/* ------------------------------------------------------------------ */
/* Segmentation                                                        */
/* ------------------------------------------------------------------ */

const PLACEHOLDER = /\[[A-Z][A-Z_0-9]{1,24}\]/g;
/** Sentence ends: . ! ? ; (not inside numbers such as 2.5), line breaks and bullets. */
const SENTENCE_SPLIT = /(?<!\d)[.!?;]+|[.!?;]+(?!\d)|[\r\n•·]+|\s[-–—]\s/;
/** Clause breaks inside a sentence. The capture keeps the joining word so contrast words can end a cue. */
const CLAUSE_SPLIT =
  /(,|\b(?:and|but|or|so|because|cause|although|though|however|whereas|while|yet|plus|except|then|also)\b)/i;
const LIST_JOINERS = new Set(["or", "and", "nor", "plus"]);
const CONTRAST = new Set(["but", "however", "although", "though", "yet", "except", "whereas"]);
/** A clause starting with one of these is a new statement: a strong cue's scope ends before it. */
const NEW_STATEMENT = new Set([
  "reports", "reported", "endorses", "endorsed", "describes", "described", "admits", "admitted",
  "complains", "complained", "notes", "noted", "states", "stated", "says", "said", "has", "have", "had",
  "is", "are", "was", "were", "feels", "felt", "gets", "got", "keeps", "kept", "now", "currently",
  "i", "she", "he", "they", "we", "client", "pt", "patient", "her", "his", "their",
]);
const CUES: readonly string[] = STRONG_NEGATION_CUES.map((c) => ` ${c} `);

function hasStrongCue(clause: string): boolean {
  const n = ` ${normalizeText(clause)} `;
  return CUES.some((c) => n.includes(c));
}

function clip(prepared: string): string {
  const words = prepared.split(" ");
  return words.length > MAX_SEGMENT_WORDS ? words.slice(0, MAX_SEGMENT_WORDS).join(" ") : prepared;
}

function tidy(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/** Split scrubbed text into the segments the model embeds (see the file comment). Deterministic. */
export function splitSegments(input: string): Segment[] {
  const text = input.slice(0, MAX_INPUT_CHARS).replace(PLACEHOLDER, " ");
  const out: Segment[] = [];
  const seen = new Set<string>();
  const push = (clause: string, negated?: boolean): void => {
    if (out.length >= MAX_SEGMENTS) return;
    const prepared = clip(prepareText(clause));
    if (!prepared || !hasContent(prepared) || seen.has(prepared)) return;
    seen.add(prepared);
    out.push({ clause: tidy(clause), text: prepared, negated: negated ?? isNegative(prepared) });
  };

  for (const sentence of text.split(SENTENCE_SPLIT)) {
    if (!sentence || !sentence.trim()) continue;
    const parts = sentence.split(CLAUSE_SPLIT);
    // parts alternates: clause, joiner, clause, joiner, ...
    const kept: { clause: string; negated: boolean }[] = [];
    let cueScope = false;
    let sentenceHasCue = false;
    let prevNegated = false;
    for (let i = 0; i < parts.length; i += 2) {
      const clause = parts[i] ?? "";
      const joiner = (parts[i - 1] ?? "").trim().toLowerCase();
      if (!clause.trim()) continue;
      const words = normalizeText(clause).split(" ");
      const first = words[0] ?? "";
      const newStatement = CONTRAST.has(joiner) || NEW_STATEMENT.has(first);
      if (newStatement) cueScope = false;
      if (hasStrongCue(clause)) {
        cueScope = true;
        sentenceHasCue = true;
        prevNegated = false;
        continue;
      }
      if (cueScope) continue;
      // A bare negator carries over a list: "no nightmares or flashbacks", "no SI, HI or AVH".
      const listed: boolean = prevNegated && !newStatement && (LIST_JOINERS.has(joiner) || (joiner === "," && words.length <= 3));
      const negated: boolean = listed || isNegative(prepareText(clause));
      prevNegated = negated;
      kept.push({ clause, negated });
    }
    if (kept.length > 1 && !sentenceHasCue) push(sentence);
    for (const k of kept) push(k.clause, k.negated);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Lexicon phrases                                                     */
/* ------------------------------------------------------------------ */

const GAP_TAIL = 5;

function pickSpread<T>(items: readonly T[], k: number): T[] {
  if (items.length <= k) return [...items];
  const idx = new Set<number>();
  for (let i = 0; i < k; i++) idx.add(Math.round((i * (items.length - 1)) / (k - 1)));
  return [...idx].sort((a, b) => a - b).map((i) => items[i] as T);
}

/**
 * Gap pattern "a|b ... c|d" (see matcher.ts) -> a few plain phrases: the first (canonical) alternative of
 * every part but the last, combined with up to GAP_TAIL alternatives of the last part, spread across its
 * list. Mixing arbitrary alternatives of both parts makes odd phrases that match noise.
 */
export function expandGapPattern(pattern: string): string[] {
  const parts = pattern.split(/\s*\.\.\.\s*/).map((p) =>
    p
      .split("|")
      .map((a) => a.trim())
      .filter(Boolean),
  );
  if (parts.length < 2 || parts.some((p) => p.length === 0)) return [pattern.replace(/\.\.\.|\|/g, " ")];
  const head = parts.slice(0, -1).map((p) => p[0] ?? "");
  return pickSpread(parts[parts.length - 1] ?? [], GAP_TAIL).map((b) => tidy([...head, b].join(" ")));
}

/** Label pieces worth embedding: split at ":" ";" and parentheses; drop one-word and meta pieces. */
function labelPieces(label: string): string[] {
  const pieces: string[] = [];
  const main = label.replace(/\([^)]*\)/g, " ");
  for (const m of label.matchAll(/\(([^)]*)\)/g)) {
    const inner = tidy(m[1] ?? "");
    if (/^(e\.?g\.?|for example|such as|i\.e\.)/i.test(inner)) continue;
    if (inner.split(" ").length <= 4) pieces.push(inner);
  }
  for (const p of main.split(/[:;]/)) pieces.push(tidy(p));
  // Meta pieces describe the note, not the client ("mentioned without saying whether", "clinician to clarify").
  return pieces.filter((p) => p.split(" ").length >= 2 && !/\bclinician\b|\bclarif|\bmentioned\b|\bwithout saying\b/i.test(p));
}

/**
 * Every phrase embedded for one symptom, in a fixed order (synonyms, plain-language label, clinician
 * label pieces), de-duplicated on their prepared form. Deterministic.
 */
export function lexiconPhrases(symptom: Pick<Symptom, "label" | "clientLabel" | "synonyms">): string[] {
  const raw: string[] = [];
  for (const s of symptom.synonyms) {
    if (s.includes("...") || s.includes("|")) raw.push(...expandGapPattern(s));
    else raw.push(s);
  }
  raw.push(symptom.clientLabel, ...labelPieces(symptom.label));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of raw) {
    const key = prepareText(p);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(tidy(p));
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Vector encoding                                                     */
/* ------------------------------------------------------------------ */

/** L2-normalize in place; returns the same array. */
export function normalize(v: Float32Array): Float32Array {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += (v[i] as number) * (v[i] as number);
  const n = Math.sqrt(s);
  if (n > 0) for (let i = 0; i < v.length; i++) v[i] = (v[i] as number) / n;
  return v;
}

/** int8 (max |x| -> 127) as lowercase hex. Hex keeps the JSON free of word-like runs (guardrail scan). */
export function encodeVectorHex(v: ArrayLike<number>): string {
  let max = 0;
  for (let i = 0; i < v.length; i++) max = Math.max(max, Math.abs(v[i] as number));
  const scale = max > 0 ? 127 / max : 0;
  let hex = "";
  for (let i = 0; i < v.length; i++) {
    const q = Math.max(-127, Math.min(127, Math.round((v[i] as number) * scale)));
    hex += (q & 0xff).toString(16).padStart(2, "0");
  }
  return hex;
}

export function decodeVectorHex(hex: string, dims: number, out = new Float32Array(dims)): Float32Array {
  if (hex.length !== dims * 2 || !/^[0-9a-f]+$/.test(hex)) throw new Error("lexicon embeddings: bad vector");
  for (let i = 0; i < dims; i++) {
    const b = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    out[i] = b > 127 ? b - 256 : b;
  }
  return normalize(out);
}

/** Validate and decode public/models/lexicon-embeddings.json into a search index. Throws on mismatch. */
export function decodeLexiconEmbeddings(json: unknown): LexiconIndex {
  const f = json as Partial<LexiconEmbeddingsFile> | null;
  if (!f || typeof f !== "object") throw new Error("lexicon embeddings: not an object");
  if (f.format !== LEXICON_EMBEDDINGS_FORMAT) throw new Error("lexicon embeddings: unknown format");
  if (f.model !== MODEL_NAME || f.revision !== MODEL_REVISION) throw new Error("lexicon embeddings: built with another model");
  if (f.dims !== MODEL_DIMS || f.encoding !== "int8-hex") throw new Error("lexicon embeddings: unexpected encoding");
  if (!Array.isArray(f.symptoms)) throw new Error("lexicon embeddings: no symptoms");
  const dims = f.dims;
  let phraseCount = 0;
  const entries: LexiconIndexEntry[] = f.symptoms.map((s) => {
    if (typeof s?.id !== "string" || !Array.isArray(s.phrases) || !Array.isArray(s.vectors) || s.phrases.length !== s.vectors.length) {
      throw new Error("lexicon embeddings: bad symptom entry");
    }
    const n = s.phrases.length;
    const vectors = new Float32Array(n * dims);
    const negative = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      decodeVectorHex(String(s.vectors[i]), dims, vectors.subarray(i * dims, (i + 1) * dims));
      negative[i] = isNegative(prepareText(String(s.phrases[i]))) ? 1 : 0;
    }
    phraseCount += n;
    return { symptomId: s.id, phrases: s.phrases.map(String), negative, vectors };
  });
  return { dims, entries, phraseCount };
}

/* ------------------------------------------------------------------ */
/* Ranking                                                             */
/* ------------------------------------------------------------------ */

export interface ResolvedOptions {
  exclude: Set<string>;
  threshold: number;
  limit: number;
  margin: number;
}

const clamp01 = (x: number, fallback: number): number => (Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : fallback);

export function resolveOptions(opts: SuggestOptions = {}): ResolvedOptions {
  const l = Number(opts.limit ?? NaN);
  return {
    exclude: new Set((opts.exclude ?? []).filter((x): x is string => typeof x === "string")),
    threshold: clamp01(Number(opts.threshold ?? NaN), DEFAULT_THRESHOLD),
    limit: Number.isFinite(l) ? Math.min(MAX_LIMIT, Math.max(1, Math.floor(l))) : DEFAULT_LIMIT,
    margin: clamp01(Number(opts.margin ?? NaN), DEFAULT_MARGIN),
  };
}

const round3 = (x: number): number => Math.round(x * 1000) / 1000;

/**
 * Scores every symptom against every segment and returns each kept symptom once with its best score,
 * sorted by score desc then id. `vectors[i]` is the unit-length embedding of `segments[i].text`.
 * Per segment:
 *  - a symptom's score is its best phrase; a negated segment may only use negative phrases;
 *  - only scores at or above `threshold` and within `margin` of the segment's best score are kept
 *    (excluded ids count for the best: a symptom that owns a clause keeps loose neighbours out of it);
 *  - a negated segment must also be within NEGATED_MARGIN of its best match over ALL phrases, positive
 *    ones included. "no nightmares" is closest to the positive phrase "nightmares", so it cannot fall
 *    back to an unrelated negative phrase; "hears voices nobody else hears" is close to both "hearing
 *    voices" and "hearing things others can't hear", so it keeps its match.
 */
export function rankSuggestions(
  segments: readonly Segment[],
  vectors: readonly Float32Array[],
  index: LexiconIndex,
  opts: SuggestOptions = {},
): SemanticSuggestion[] {
  const { exclude, threshold, limit, margin } = resolveOptions(opts);
  const dims = index.dims;
  const entries = index.entries;
  const best = new Map<string, SemanticSuggestion>();
  const scores = new Float64Array(entries.length);
  const phraseAt = new Int32Array(entries.length);
  for (let s = 0; s < segments.length; s++) {
    const q = vectors[s];
    const seg = segments[s];
    if (!q || !seg || q.length !== dims) continue;
    let segBest = -Infinity;
    let anyBest = -Infinity;
    for (let e = 0; e < entries.length; e++) {
      const entry = entries[e] as LexiconIndexEntry;
      let top = -Infinity;
      let topP = -1;
      for (let p = 0; p < entry.phrases.length; p++) {
        const off = p * dims;
        let dot = 0;
        for (let i = 0; i < dims; i++) dot += (q[i] as number) * (entry.vectors[off + i] as number);
        if (dot > anyBest) anyBest = dot;
        if (seg.negated && entry.negative[p] !== 1) continue;
        if (dot > top) {
          top = dot;
          topP = p;
        }
      }
      scores[e] = topP < 0 ? -Infinity : round3(Math.max(0, top));
      phraseAt[e] = topP;
      if ((scores[e] as number) > segBest) segBest = scores[e] as number;
    }
    const floor = Math.max(
      threshold,
      round3(segBest - margin),
      seg.negated ? round3(anyBest - NEGATED_MARGIN) : -Infinity,
    );
    for (let e = 0; e < entries.length; e++) {
      const score = scores[e] as number;
      const entry = entries[e] as LexiconIndexEntry;
      if (score < floor || exclude.has(entry.symptomId)) continue;
      const prev = best.get(entry.symptomId);
      if (prev && prev.score >= score) continue;
      best.set(entry.symptomId, {
        symptomId: entry.symptomId,
        score,
        phrase: entry.phrases[phraseAt[e] as number] ?? "",
        clause: seg.clause,
      });
    }
  }
  const out = [...best.values()];
  out.sort((a, b) => b.score - a.score || (a.symptomId < b.symptomId ? -1 : a.symptomId > b.symptomId ? 1 : 0));
  return out.slice(0, limit);
}
