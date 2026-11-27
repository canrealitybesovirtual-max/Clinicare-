/**
 * Trigger extraction: finds feared objects and situations in ALREADY-SCRUBBED text (run scrubPHI first)
 * and maps them through the curated dictionary (content/trigger-objects.json) to a category.
 *
 * Pure and deterministic: no I/O, no clock, nothing stored or sent. Uses the symptom matcher's
 * normalizeText() and stem(), so "dogs" ~ "dog", "flying" ~ "fly", "panicked" ~ "panic".
 *
 * Pipeline
 *  1. Tokens: the text is split into words with their offsets. Sentences end at . ; ! ? and line breaks;
 *     contrast words (but, however, although, though, except, whereas) start a new clause. PHI
 *     placeholders such as "[NAME]" are never matched.
 *  2. Cues (forward): a fear, panic or avoidance cue opens a short window:
 *       fear       afraid / scared / frightened / fearful / terrified / petrified / phobic / nervous /
 *                  anxious / uneasy / worried / worries / worrying / obsessed / preoccupied / horrified, as
 *                  exact words, + preposition ("afraid of", "scared to", "anxious around", "nervous when");
 *                  fear(s) / phobia / dread (+ optional "of"); terror + preposition; "triggered by",
 *                  "set off by", "triggers:"
 *       panic      panic(s|ked|king) (+ optional "attack(s)" / "episode(s)") + preposition: "panic from",
 *                  "panic around", "panic attacks near", "panics when (seeing)", "panic with";
 *                  freak(s|ed|ing) out (+ optional "around" / "at"); panicky + preposition
 *       avoidance  avoid(s|ed|ing), avoidance (of), stays / keeps away from, steers clear of, can't go near,
 *                  unable to go near, won't go near, can't be near / around, can't stand / handle / face /
 *                  tolerate, refuses to; "won't", "can't", "cannot" and "stopped" only when no preposition
 *                  follows and the object comes within a few words ("can't fly", "stopped driving", never
 *                  "stopped at the store")
 *     Inside the window (same sentence and clause) up to 5 words may come before the first object
 *     ("afraid of the neighbor's big dog", "panics when she sees a dog"), and lists continue with at most
 *     3 words between objects ("afraid of dogs, cats and snakes"). The window stops at the next cue and,
 *     once an object was found, at "since" / "after" (the event that follows is context, not an object).
 *  3. Reverse and suffix cues: "dogs scare her", "needles terrify him", "crowds make her panic",
 *     "dog phobia". Reverse verbs are exact words, so "surgery scar" is not "surgery scares".
 *  4. Negation: a negator just before the cue ("not afraid of", "denies fear of", "never panics around",
 *     "doesn't avoid", "no longer afraid of") marks the hits negated; a new subject in between ends the
 *     look-back ("No, she is afraid of dogs" stays positive). Negated hits are dropped unless
 *     includeNegated is set.
 *  5. Trauma context: when the fear is tied to an event ("since the attack", "after the accident", "ever
 *     since being bitten", "was mugged") in the same or the neighboring comma-separated part of the
 *     sentence, or anywhere in the previous sentence, the hit's category becomes "trauma-reminder" and
 *     `baseCategory` keeps the object's own category. The context does not run down a comma list.
 *  6. Longest dictionary term wins at a position; spans never overlap; results in text order.
 *
 * Privacy: `phrase` is the matched dictionary words exactly as typed in the scrubbed text and stays on the
 * device. Only `objectId` and `category` (curated codes) may ever be used as outbound keywords.
 */
import { normalizeText, stem } from "@/lib/matcher";
import {
  TRIGGER_CATEGORIES,
  type TriggerCategory,
  type TriggerCueKind,
  type TriggerObjectsFile,
} from "@/lib/schemas-follow-up";
import { triggerDictionary } from "./dictionary";

export interface TriggerHit {
  category: TriggerCategory;
  /** The matched dictionary words as written in the scrubbed text (stays on the device). */
  phrase: string;
  /** Offsets into the text passed to extractTriggers: text.slice(start, end) === phrase. */
  start: number;
  end: number;
  /** Curated dictionary id, e.g. "dog". Safe to use as a code. */
  objectId: string;
  /** Set when category is "trauma-reminder" because of an event cue: the object's own category. */
  baseCategory?: TriggerCategory;
  cue: TriggerCueKind;
  /** Normalized cue words from the curated cue list, e.g. "panic from", "afraid of", "avoids". */
  cuePhrase: string;
  /** Normalized event words when the trauma context applied, e.g. "since the attack". */
  traumaCue?: string;
  negated: boolean;
}

export interface ExtractTriggersOptions {
  /** Also return negated mentions ("not afraid of dogs"), flagged negated: true. Default false. */
  includeNegated?: boolean;
  dictionary?: TriggerObjectsFile;
}

/* ------------------------------------------------------------------ tokens */

interface Tok {
  norm: string;
  stem: string;
  start: number;
  end: number;
  sentence: number;
  clause: number;
  /** Comma-separated part of the sentence (list items): scopes the trauma context. */
  segment: number;
  placeholder: boolean;
}

const TOKEN_RE = /[\p{L}\p{N}\p{M}'`´‘’‛′ʼ＇]+/gu;
const SENTENCE_BREAK = /[.;!?\n\r]/;
const PLACEHOLDER_RE = /\[[A-Z0-9_]+\]/g;
const CONTRAST = new Set(["but", "however", "although", "though", "except", "whereas"]);

function tokenize(text: string): Tok[] {
  const placeholders: [number, number][] = [];
  for (const m of text.matchAll(PLACEHOLDER_RE)) placeholders.push([m.index, m.index + m[0].length]);
  const inPlaceholder = (pos: number) => placeholders.some(([a, b]) => pos >= a && pos < b);

  const toks: Tok[] = [];
  let sentence = 0;
  let clause = 0;
  let segment = 0;
  let last = 0;
  for (const m of text.matchAll(TOKEN_RE)) {
    const start = m.index;
    const end = start + m[0].length;
    const gap = text.slice(last, start);
    if (SENTENCE_BREAK.test(gap)) {
      sentence++;
      clause++;
      segment++;
    } else if (gap.includes(",")) segment++;
    last = end;
    const norm = normalizeText(m[0]);
    if (!norm) continue;
    const placeholder = inPlaceholder(start);
    for (const w of norm.split(" ")) {
      if (CONTRAST.has(w)) clause++;
      toks.push({ norm: w, stem: stem(w), start, end, sentence, clause, segment, placeholder });
    }
  }
  return toks;
}

const stems = (phrase: string) => normalizeText(phrase).split(" ").filter(Boolean).map(stem);

/* ------------------------------------------------------------------ dictionary index */

interface TermEntry {
  objectId: string;
  category: TriggerCategory;
  stems: string[];
  order: number;
}

const indexCache = new WeakMap<TriggerObjectsFile, Map<string, TermEntry[]>>();

function termIndex(dict: TriggerObjectsFile): Map<string, TermEntry[]> {
  let idx = indexCache.get(dict);
  if (idx) return idx;
  idx = new Map();
  const seen = new Set<string>();
  let order = 0;
  for (const o of dict.objects) {
    for (const t of o.terms) {
      const s = stems(t);
      const key = s.join(" ");
      if (s.length === 0 || seen.has(key)) continue; // first object wins (the dictionary test forbids collisions)
      seen.add(key);
      const entry: TermEntry = { objectId: o.id, category: o.category, stems: s, order: order++ };
      const first = s[0] as string;
      const bucket = idx.get(first);
      if (bucket) bucket.push(entry);
      else idx.set(first, [entry]);
    }
  }
  for (const bucket of idx.values()) bucket.sort((a, b) => b.stems.length - a.stems.length || a.order - b.order);
  indexCache.set(dict, idx);
  return idx;
}

interface TermMatch {
  entry: TermEntry;
  i: number; // first token
  len: number; // token count
}

function termAt(toks: Tok[], i: number, idx: Map<string, TermEntry[]>): TermMatch | null {
  const t = toks[i];
  if (!t || t.placeholder) return null;
  for (const entry of idx.get(t.stem) ?? []) {
    let ok = true;
    for (let k = 1; k < entry.stems.length; k++) {
      const u = toks[i + k];
      if (!u || u.placeholder || u.sentence !== t.sentence || u.stem !== entry.stems[k]) {
        ok = false;
        break;
      }
    }
    if (ok) return { entry, i, len: entry.stems.length };
  }
  return null;
}

/* ------------------------------------------------------------------ cues */

interface CueDef {
  /** Stems to match, or exact normalized words when `exact` is set (fear adjectives: "scared" must not match "scar"). */
  seq: string[];
  exact: boolean;
  kind: TriggerCueKind;
  /** required: a preposition must follow ("afraid of"); forbidden: none may follow ("stopped driving", not "stopped at"). */
  prep: "required" | "optional" | "none" | "forbidden";
  /** Words allowed between the cue and the first object. */
  lead: number;
}

const LEAD = 5; // default words allowed between a cue and the first object

const cue = (words: string, kind: TriggerCueKind, prep: CueDef["prep"], lead = LEAD): CueDef => ({
  seq: stems(words),
  exact: false,
  kind,
  prep,
  lead,
});
const exactCue = (word: string, kind: TriggerCueKind, prep: CueDef["prep"], lead = LEAD): CueDef => ({
  seq: [normalizeText(word)],
  exact: true,
  kind,
  prep,
  lead,
});

const FEAR_ADJECTIVES = [
  "afraid", "scared", "frightened", "fearful", "terrified", "petrified", "phobic", "nervous", "anxious",
  "uneasy", "worried", "worries", "worrying", "obsessed", "preoccupied", "horrified",
];

const CUES: readonly CueDef[] = [
  ...FEAR_ADJECTIVES.map((w) => exactCue(w, "fear", "required")),
  cue("fear", "fear", "optional"),
  cue("phobia", "fear", "optional"),
  cue("dread", "fear", "optional"),
  cue("terror", "fear", "required"),
  cue("triggered by", "fear", "none"),
  cue("set off by", "fear", "none"),
  exactCue("triggers", "fear", "optional", 2),
  cue("panic", "panic", "required"),
  exactCue("panicky", "panic", "required"),
  cue("freak out", "panic", "optional"),
  cue("avoid", "avoidance", "optional"),
  cue("avoidance", "avoidance", "optional"),
  cue("stays away from", "avoidance", "none"),
  cue("stay away from", "avoidance", "none"),
  cue("keeps away from", "avoidance", "none"),
  cue("keep away from", "avoidance", "none"),
  cue("steers clear of", "avoidance", "none"),
  cue("cant go near", "avoidance", "none"),
  cue("unable to go near", "avoidance", "none"),
  cue("wont go near", "avoidance", "none"),
  cue("cant be near", "avoidance", "none"),
  cue("cant be around", "avoidance", "none"),
  cue("cant stand", "avoidance", "optional"),
  cue("cant handle", "avoidance", "optional"),
  cue("cant face", "avoidance", "optional"),
  cue("cant tolerate", "avoidance", "optional"),
  cue("refuses to", "avoidance", "none", 3),
  cue("refuse to", "avoidance", "none", 3),
  exactCue("wont", "avoidance", "forbidden", 3),
  // "can't fly", "cannot drive", "unable to ride the subway": the object must follow within two words.
  exactCue("cant", "avoidance", "forbidden", 2),
  exactCue("cannot", "avoidance", "forbidden", 2),
  cue("unable to", "avoidance", "none", 2),
  exactCue("stopped", "avoidance", "forbidden", 2),
];

const CUES_BY_FIRST = new Map<string, CueDef[]>();
for (const c of CUES) {
  const first = c.seq[0] as string;
  CUES_BY_FIRST.set(first, [...(CUES_BY_FIRST.get(first) ?? []), c].sort((a, b) => b.seq.length - a.seq.length));
}

const PREPS = new Set(
  [
    "of", "to", "around", "about", "near", "with", "when", "whenever", "by", "at", "from", "over", "in", "on",
    "during", "if", "because", "before", "while", "after", "toward", "towards",
  ].map(stem),
);
const PANIC_NOUNS = new Set(["attack", "attacks", "episode", "episodes"].map(stem));

interface CueMatch {
  def: CueDef;
  i: number; // first cue token
  end: number; // index after the cue (preposition included)
}

function cueAt(toks: Tok[], i: number): CueMatch | null {
  const t = toks[i];
  if (!t || t.placeholder) return null;
  const defs = [...(CUES_BY_FIRST.get(t.stem) ?? []), ...(t.norm !== t.stem ? (CUES_BY_FIRST.get(t.norm) ?? []) : [])];
  for (const def of defs) {
    let j = i;
    let ok = true;
    for (const s of def.seq) {
      const u = toks[j];
      if (!u || u.sentence !== t.sentence || (def.exact ? u.norm : u.stem) !== s) {
        ok = false;
        break;
      }
      j++;
    }
    if (!ok) continue;
    if (def.kind === "panic" && toks[j]?.sentence === t.sentence && PANIC_NOUNS.has(toks[j]?.stem ?? "")) j++;
    let preps = 0;
    while (def.prep !== "forbidden" && preps < 2 && toks[j]?.sentence === t.sentence && PREPS.has(toks[j]?.stem ?? "")) {
      j++;
      preps++;
    }
    if (def.prep === "required" && preps === 0) continue;
    if (def.prep === "forbidden" && toks[j]?.sentence === t.sentence && PREPS.has(toks[j]?.stem ?? "")) continue;
    return { def, i, end: j };
  }
  return null;
}

/* ------------------------------------------------------------------ negation and trauma context */

const NEGATORS = new Set([
  "no", "not", "never", "without", "nor", "neither", "denies", "denied", "deny", "denying",
  "isnt", "wasnt", "arent", "werent", "doesnt", "dont", "didnt", "hasnt", "havent", "hadnt",
]);
const SUBJECTS = new Set(["i", "she", "he", "they", "we", "you", "client", "pt", "patient"]);
const NEG_LOOKBACK = 3;

function negatedBefore(toks: Tok[], i: number): boolean {
  const t = toks[i];
  if (!t) return false;
  for (let k = i - 1; k >= 0 && k >= i - NEG_LOOKBACK; k--) {
    const u = toks[k] as Tok;
    if (u.sentence !== t.sentence || u.clause !== t.clause) break;
    if (NEGATORS.has(u.norm)) return true;
    if (SUBJECTS.has(u.norm)) break;
  }
  return false;
}

function negatedBetween(toks: Tok[], from: number, to: number): boolean {
  for (let k = from; k < to; k++) if (NEGATORS.has((toks[k] as Tok).norm)) return true;
  return false;
}

const TEMPORAL = new Set(["since", "after", "following"].map(stem));
const EVENT_NOUNS = new Set(
  [
    "accident", "attack", "assault", "crash", "collision", "wreck", "shooting", "stabbing", "robbery", "mugging",
    "rape", "abuse", "fire", "explosion", "bombing", "war", "combat", "deployment", "earthquake", "hurricane",
    "flood", "tornado", "disaster", "incident", "bite", "injury", "trauma", "carjacking", "kidnapping",
  ].map(stem),
);
const EVENT_PARTICIPLES = new Set([
  "attacked", "assaulted", "bitten", "mauled", "mugged", "robbed", "raped", "shot", "stabbed", "injured", "hurt",
  "abused", "chased", "threatened", "kidnapped", "carjacked", "hit", "beaten", "trapped",
]);
/** Past-tense "be/get" only: "afraid of being attacked" or "scared to get hurt" describe the fear, not an event. */
const BE = new Set(["was", "were", "got", "been"]);

interface TraumaCue {
  sentence: number;
  segment: number;
  text: string;
}

/**
 * Event cues ("since the attack", "was bitten"). A cue applies to a hit in the same comma-separated part
 * of the sentence or the part right next to it ("afraid of dogs, ever since being bitten"), or to any hit in
 * the following sentence ("Was bitten by a dog. Now panics around dogs."). It does not run down a list:
 * in "nightmares since the assault, panic attacks, avoids crowds" the crowds are not tied to the event.
 */
function traumaCueFor(cues: readonly TraumaCue[], t: Tok): TraumaCue | undefined {
  return (
    cues.find((c) => c.sentence === t.sentence && Math.abs(c.segment - t.segment) <= 1) ??
    cues.find((c) => c.sentence === t.sentence - 1)
  );
}

function traumaCues(toks: Tok[]): TraumaCue[] {
  const out: TraumaCue[] = [];
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i] as Tok;
    const temporal = TEMPORAL.has(t.stem);
    const be = BE.has(t.norm);
    if (!temporal && !be) continue;
    const reach = temporal ? 4 : 3;
    for (let k = i + 1; k < toks.length && k <= i + reach; k++) {
      const u = toks[k] as Tok;
      if (u.sentence !== t.sentence) break;
      const event = EVENT_PARTICIPLES.has(u.norm) || (temporal && EVENT_NOUNS.has(u.stem));
      if (!event) continue;
      if (negatedBefore(toks, i) || negatedBetween(toks, i + 1, k)) break; // "has never been attacked", "was never hurt"
      out.push({
        sentence: t.sentence,
        segment: u.segment,
        text: toks
          .slice(i, k + 1)
          .map((x) => x.norm)
          .join(" "),
      });
      i = k;
      break;
    }
  }
  return out;
}

/* ------------------------------------------------------------------ extraction */

const LIST_GAP = 3; // words allowed between two listed objects
const REVERSE_REACH = 3;
/** Exact words (not stems): "surgery scar" must not read as "surgery scares". */
const REVERSE_FEAR = new Set([
  "scare", "scares", "scared", "scary", "terrify", "terrifies", "terrified", "terrifying", "frighten", "frightens",
  "frightened", "frightening", "trigger", "triggers", "triggered", "petrify", "petrifies",
]);
const MAKE = new Set(["make", "makes", "made", "making"]);
const MAKE_FEELINGS = new Map<string, TriggerCueKind>([
  ...["panic", "panicky", "panicked", "freak", "freaks"].map((w) => [w, "panic"] as [string, TriggerCueKind]),
  ...["nervous", "anxious", "afraid", "scared", "uneasy", "frightened", "terrified", "jumpy", "tense"].map((w) => [w, "fear"] as [string, TriggerCueKind]),
]);
const PHOBIA_SUFFIX = new Set(["phobia", "phobic", "phobias"].map(stem));

interface RawHit {
  match: TermMatch;
  cue: TriggerCueKind;
  cuePhrase: string;
  negated: boolean;
}

export function extractTriggers(text: string, opts: ExtractTriggersOptions = {}): TriggerHit[] {
  if (!text || !text.trim()) return [];
  const dict = opts.dictionary ?? triggerDictionary;
  const idx = termIndex(dict);
  const toks = tokenize(text);
  const raw = new Map<number, RawHit>(); // keyed by first token index

  const add = (h: RawHit) => {
    const prev = raw.get(h.match.i);
    // One hit per span: keep the positive one, then the longer term, then the first found.
    if (!prev || (prev.negated && !h.negated) || (prev.negated === h.negated && h.match.len > prev.match.len)) raw.set(h.match.i, h);
  };

  // Forward cues.
  for (let i = 0; i < toks.length; i++) {
    const c = cueAt(toks, i);
    if (!c) continue;
    const head = toks[i] as Tok;
    const negated = negatedBefore(toks, i);
    const cuePhrase = toks
      .slice(c.i, c.end)
      .map((x) => x.norm)
      .join(" ");
    let j = c.end;
    let gap = 0;
    let limit = c.def.lead;
    let found = 0;
    while (j < toks.length) {
      const u = toks[j] as Tok;
      if (u.sentence !== head.sentence || u.clause !== head.clause) break;
      if (j > c.end && cueAt(toks, j)) break;
      if (found > 0 && TEMPORAL.has(u.stem)) break; // "afraid of needles since the accident": the event is context
      const m = termAt(toks, j, idx);
      if (m) {
        add({ match: m, cue: c.def.kind, cuePhrase, negated });
        found++;
        j += m.len;
        gap = 0;
        limit = LIST_GAP;
        continue;
      }
      gap++;
      if (gap > limit) break;
      j++;
    }
    if (found > 0) i = Math.max(i, c.end - 1);
  }

  // Reverse ("dogs scare her", "crowds make her panic") and suffix ("dog phobia") cues.
  for (let i = 0; i < toks.length; i++) {
    const m = termAt(toks, i, idx);
    if (!m) continue;
    const t = toks[i] as Tok;
    const after = i + m.len;
    i = after - 1; // never re-read the inside of a multi-word term ("deep water" must not also give "water")
    const next = toks[after];
    if (next && next.sentence === t.sentence && PHOBIA_SUFFIX.has(next.stem)) {
      add({ match: m, cue: "fear", cuePhrase: next.norm, negated: negatedBefore(toks, i) });
      continue;
    }
    for (let k = after; k < toks.length && k < after + REVERSE_REACH + 1; k++) {
      const u = toks[k] as Tok;
      if (u.sentence !== t.sentence || u.clause !== t.clause) break;
      if (REVERSE_FEAR.has(u.norm)) {
        add({ match: m, cue: "fear", cuePhrase: u.norm, negated: negatedBetween(toks, after, k) });
        break;
      }
      if (MAKE.has(u.norm)) {
        for (let q = k + 1; q < toks.length && q <= k + 3; q++) {
          const v = toks[q] as Tok;
          if (v.sentence !== t.sentence) break;
          const kind = MAKE_FEELINGS.get(v.norm);
          if (kind) {
            add({ match: m, cue: kind, cuePhrase: `${u.norm} ${v.norm}`, negated: negatedBetween(toks, after, q) });
            break;
          }
        }
        break;
      }
    }
  }

  const trauma = traumaCues(toks);
  const out: TriggerHit[] = [];
  let lastEnd = -1; // token index after the last kept hit: spans never overlap
  for (const h of [...raw.values()].sort((a, b) => a.match.i - b.match.i || b.match.len - a.match.len)) {
    if (h.match.i < lastEnd) continue;
    lastEnd = h.match.i + h.match.len;
    if (h.negated && !opts.includeNegated) continue;
    const first = toks[h.match.i] as Tok;
    const last = toks[h.match.i + h.match.len - 1] as Tok;
    const traumaCue = traumaCueFor(trauma, first)?.text;
    const own = h.match.entry.category;
    const hit: TriggerHit = {
      category: traumaCue ? "trauma-reminder" : own,
      phrase: text.slice(first.start, last.end),
      start: first.start,
      end: last.end,
      objectId: h.match.entry.objectId,
      cue: h.cue,
      cuePhrase: h.cuePhrase,
      negated: h.negated,
    };
    if (traumaCue) {
      hit.traumaCue = traumaCue;
      if (own !== "trauma-reminder") hit.baseCategory = own;
    }
    out.push(hit);
  }
  return out;
}

/** Categories in play (non-negated hits, base categories included), in TRIGGER_CATEGORIES order. */
export function triggerCategoriesOf(hits: readonly TriggerHit[]): TriggerCategory[] {
  const set = new Set<TriggerCategory>();
  for (const h of hits) {
    if (h.negated) continue;
    set.add(h.category);
    if (h.baseCategory) set.add(h.baseCategory);
  }
  return TRIGGER_CATEGORIES.filter((c) => set.has(c));
}

export interface TriggerSummary {
  category: TriggerCategory;
  label: string; // category label from the dictionary
  objectIds: string[];
  /** Curated display labels of those objects ("dogs", "leaving the house"), same order as objectIds. */
  objectLabels: string[];
  phrases: string[]; // distinct phrases as typed, first mention first
}

const labelCache = new WeakMap<TriggerObjectsFile, Map<string, string>>();

/** Curated display label of a dictionary object ("dog" -> "dogs"); the id itself when unknown. */
export function objectLabel(objectId: string, dict: TriggerObjectsFile = triggerDictionary): string {
  let m = labelCache.get(dict);
  if (!m) {
    m = new Map(dict.objects.map((o) => [o.id, o.label] as const));
    labelCache.set(dict, m);
  }
  return m.get(objectId) ?? objectId;
}

/** Answers that tie the described fear to its object: the fear is circumscribed, or the object is avoided. */
const OBJECT_FEAR_IDS: ReadonlySet<string> = new Set(["circumscribed-fear", "phobic-avoidance"]);

/**
 * Phobia-type symptoms of the described objects (dogs: fear of animals) once a follow-up answer has tied the
 * fear to them ("Only around dogs", "Yes: avoids dogs"). The text named the object and the clinician's own answer
 * confirmed it, so the subtype is documented too; ids that are absent or already present are left out. Pure.
 */
export function answerConfirmedSubtypes(
  hits: readonly TriggerHit[],
  addedByAnswers: readonly string[],
  opts: { present: readonly string[]; absent: readonly string[]; dictionary?: TriggerObjectsFile },
): string[] {
  if (!addedByAnswers.some((id) => OBJECT_FEAR_IDS.has(id))) return [];
  const dict = opts.dictionary ?? triggerDictionary;
  const skip = new Set([...opts.present, ...opts.absent]);
  const out: string[] = [];
  for (const h of hits) {
    if (h.negated) continue;
    const id = dict.objects.find((o) => o.id === h.objectId)?.symptomId;
    if (id && !skip.has(id) && !out.includes(id)) out.push(id);
  }
  return out;
}

/** One row per category for display (non-negated hits only), in TRIGGER_CATEGORIES order. */
export function summarizeTriggers(hits: readonly TriggerHit[], dict: TriggerObjectsFile = triggerDictionary): TriggerSummary[] {
  const rows = new Map<TriggerCategory, TriggerSummary>();
  for (const h of hits) {
    if (h.negated) continue;
    const row = rows.get(h.category) ?? {
      category: h.category,
      label: dict.categories[h.category].label,
      objectIds: [],
      objectLabels: [],
      phrases: [],
    };
    if (!row.objectIds.includes(h.objectId)) {
      row.objectIds.push(h.objectId);
      row.objectLabels.push(objectLabel(h.objectId, dict));
    }
    const p = h.phrase.toLowerCase();
    if (!row.phrases.includes(p)) row.phrases.push(p);
    rows.set(h.category, row);
  }
  return TRIGGER_CATEGORIES.flatMap((c) => rows.get(c) ?? []);
}
