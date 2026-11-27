/**
 * Deterministic guided follow-up engine (runs in the browser; no network, no storage, no clock, no randomness).
 *
 * nextQuestions(ctx, opts) picks up to 5 original, clinician-facing questions from the curated bank
 * (content/follow-ups/*.json), each labeled "For clinician review" and carrying a plain "why asked":
 *
 *   tier 0  SAFETY      offered whenever low mood, hopelessness, trauma, grief or substance signals appear,
 *                       or a red flag is documented (up to 3, always first). Safety answers only record
 *                       what the clinician chose; nothing here estimates or decides risk.
 *   tier 1  DISCRIMINATE questions that best tell the top 2-3 candidates apart, or that let an empty or
 *                       insufficient result become informative (a trigger with no condition match, such as
 *                       "panic from dogs", always yields trigger-specific questions). Ranked by:
 *                         +30 a trigger category or cue the question is written for is present
 *                         +15 ...and nothing in the knowledge base matches yet (status "empty"/"insufficient")
 *                         +12 per top-3 candidate the question is declared to bear on (discriminates[])
 *                         + simulation (0-50): each answer is applied to a copy of the input and re-scored
 *                           with scoreConditions(); the more the answers move candidate scores apart
 *                           (largest spread of one candidate, change in the top-2 margin, change of the
 *                           top candidate), the higher the value
 *   tier 2  GATES       unknown duration / impairment / substance / medical. Base 30 / 25 / 15 / 10, +10 per
 *                       top-3 candidate that flags the gate, +3 when written for a present trigger.
 *   tier 3  CORE        a question about a key feature the top candidate is missing (+40; +25 for the 2nd or
 *                       3rd candidate; +10 for a missing supporting feature), +15 trigger, + simulation/2.
 *                       Core questions with nothing missing to ask about are dropped.
 *
 * Batch assembly: safety (max 3), then discriminate (max 3), then 1 gate, then 1 core, then the best of the
 * rest; at most one question per `group` (e.g. one way of asking about duration). The batch is then shown
 * in tier order. Ties break on priority, then id, so the output never depends on input order.
 *
 * A question is skipped when it was answered (unless every chosen option is keepOpen, "not asked yet"),
 * when none of its showWhen signals is present, when its gate is already known, or when every symptom it
 * targets is already known (present, or noted absent by an answer or by the text matcher).
 *
 * applyAnswer() / applyAnswers() turn answers into a new ScoringInput, purely, using the bank's small effect
 * vocabulary (addSymptomIds, negateSymptomIds, setDuration, setImpairment, setSubstancePossible,
 * setMedicalPossible, addTriggerCategory). A negation never removes a red-flag symptom (G9) and never
 * removes ids the caller protects (for example chips the clinician selected).
 *
 * Never in client mode: with mode "client" nextQuestions() returns [] (questions name conditions).
 */
import { conditions as defaultConditions, lexicon } from "@/lib/content";
import { PART2_NOTICE } from "@/lib/referral-links";
import type { Condition, RedFlagType, Symptom } from "@/lib/schemas";
import {
  SURFACES,
  TRIGGER_CATEGORIES,
  TRIGGER_TOKEN,
  type AnswerEffects,
  type AnswerOption,
  type FollowUpDomain,
  type FollowUpQuestionDef,
  type GateField,
  type QuestionKind,
  type ShowWhen,
  type Surface,
  type TriggerCategory,
  type TriggerCueKind,
} from "@/lib/schemas-follow-up";
import { scoreConditions } from "@/lib/scoring";
import type { ScoringInput, ScoringResult, Suggestion } from "@/lib/types";
import { followUpBank, getQuestionDef } from "./bank";
import { triggerDictionary } from "./dictionary";
import { extractTriggers, triggerCategoriesOf, type TriggerHit } from "./triggers";

export const REVIEW_LABEL = "For clinician review" as const;
export const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 10;
/** Discriminate questions below this value are relevant only through a documented signal. */
const STRONG_DISCRIMINATOR = 10;

/* ------------------------------------------------------------------ public types */

/** One answered question. Curated ids only: never free text. Keep it in memory-only session state. */
export interface AnsweredRecord {
  questionId: string;
  answerIds: readonly string[];
}

export interface FollowUpContext {
  /** The input AFTER applyAnswers() (chips + text matches + answer effects). */
  scoringInput: ScoringInput;
  /** scoreConditions(scoringInput, conditions, symptoms) for that same input. */
  scoringResult: ScoringResult;
  /** extractTriggers(scrubbedText). Negated hits are ignored. */
  triggers: readonly TriggerHit[];
  answered: readonly AnsweredRecord[];
  /** Symptom ids the text matcher found negated ("denies nightmares"): treated as known. */
  absentSymptomIds?: readonly string[];
  /** Extra trigger categories from answers (applyAnswers().triggerCategories). */
  triggerCategories?: readonly TriggerCategory[];
}

export interface EngineOptions {
  limit?: number; // default 5, max 10
  bank?: readonly FollowUpQuestionDef[];
  /** The conditions the result was scored with (default: content.ts conditions). Used for simulation and names. */
  conditions?: readonly Condition[];
  symptoms?: readonly Symptom[];
  mode?: "clinician" | "client";
}

export type WhyKind = "safety" | "trigger" | "insufficient" | "discriminate" | "simulation" | "gate" | "missing-core" | "signal";
export interface WhyReason {
  kind: WhyKind;
  text: string;
}

export interface RenderedOption {
  id: string;
  label: string;
  surfaces: Surface[];
  keepOpen: boolean;
  exclusive: boolean;
  note?: string;
}

export interface FollowUpQuestion {
  id: string;
  kind: QuestionKind;
  domain: FollowUpDomain;
  select: "one" | "many";
  text: string;
  /** "Why this helps" (from the bank). */
  why: string;
  /** Why the engine asked it now (explainable ranking). */
  whyAsked: string;
  reasons: WhyReason[];
  options: RenderedOption[];
  tier: 0 | 1 | 2 | 3;
  rankScore: number;
  /** The trigger templated into the text, if any. `phrase` stays on the device. */
  trigger?: { category: TriggerCategory; objectId: string; phrase: string };
  /** Conditions in the knowledge base this question bears on (clinician mode only). */
  discriminates: { conditionId: string; name: string }[];
  sud: boolean;
  part2Notice?: string;
  label: typeof REVIEW_LABEL;
}

export interface AppliedAnswer {
  scoringInput: ScoringInput;
  addedSymptomIds: string[];
  negatedSymptomIds: string[];
  triggerCategories: TriggerCategory[];
  /** Resources the chosen options bring forward (in SURFACES order). Never a risk level. */
  surfaces: Surface[];
  notes: string[];
  record: AnsweredRecord;
  /** Every chosen option is keepOpen ("not asked yet"): the question stays in the queue. */
  keepOpen: boolean;
}

export interface FoldedAnswers {
  scoringInput: ScoringInput;
  /** Net: added by answers and still present. */
  addedSymptomIds: string[];
  /** Net: removed by answers and not re-added later. Treat as "noted absent". */
  negatedSymptomIds: string[];
  triggerCategories: TriggerCategory[];
  surfaces: Surface[];
  notes: string[];
  /** Records that were skipped because their question or option ids are unknown. */
  invalid: AnsweredRecord[];
  /** The records actually applied (last answer per question, in order). */
  applied: AnsweredRecord[];
}

export interface ApplyOptions {
  bank?: readonly FollowUpQuestionDef[];
  symptoms?: readonly Symptom[];
  /** Ids a negation must never remove (for example the chips the clinician selected). */
  protectedSymptomIds?: readonly string[];
}

/* ------------------------------------------------------------------ applying answers */

const lexiconCache = new WeakMap<readonly Symptom[], Map<string, Symptom>>();
function lexMap(symptoms: readonly Symptom[]): Map<string, Symptom> {
  let m = lexiconCache.get(symptoms);
  if (!m) {
    m = new Map();
    for (const s of symptoms) if (!m.has(s.id)) m.set(s.id, s);
    lexiconCache.set(symptoms, m);
  }
  return m;
}

const uniq = <T,>(xs: Iterable<T>): T[] => [...new Set(xs)];

interface EffectResult {
  input: ScoringInput;
  added: string[];
  negated: string[];
}

function applyEffects(
  input: ScoringInput,
  effects: AnswerEffects,
  lex: ReadonlyMap<string, Symptom>,
  protect: ReadonlySet<string>,
): EffectResult {
  let ids = uniq(input.symptomIds);
  const added: string[] = [];
  const negated: string[] = [];
  for (const id of effects.negateSymptomIds ?? []) {
    if (lex.get(id)?.redFlag || protect.has(id)) continue; // G9: a follow-up answer never hides a red flag
    ids = ids.filter((x) => x !== id);
    negated.push(id);
  }
  for (const id of effects.addSymptomIds ?? []) {
    if (!ids.includes(id)) ids.push(id);
    added.push(id);
  }
  return {
    input: {
      symptomIds: ids,
      duration: effects.setDuration ?? input.duration,
      impairment: effects.setImpairment ?? input.impairment,
      substancePossible: effects.setSubstancePossible ?? input.substancePossible,
      medicalPossible: effects.setMedicalPossible ?? input.medicalPossible,
    },
    added,
    negated,
  };
}

function chosenOptions(def: FollowUpQuestionDef, answer: string | readonly string[]): AnswerOption[] {
  const ids = uniq(typeof answer === "string" ? [answer] : answer);
  if (ids.length === 0) throw new RangeError(`No answer given for follow-up question ${def.id}`);
  if (def.select === "one" && ids.length > 1) throw new RangeError(`Follow-up question ${def.id} takes one answer`);
  for (const id of ids)
    if (!def.options.some((o) => o.id === id)) throw new RangeError(`Unknown answer ${id} for follow-up question ${def.id}`);
  const chosen = def.options.filter((o) => ids.includes(o.id)); // bank order: deterministic whatever the input order
  if (chosen.length > 1 && chosen.some((o) => o.exclusive))
    throw new RangeError(`Answer ${chosen.find((o) => o.exclusive)?.id} of ${def.id} cannot be combined with others`);
  return chosen;
}

function orderSurfaces(set: ReadonlySet<Surface>): Surface[] {
  return SURFACES.filter((s) => set.has(s));
}
function orderCategories(set: ReadonlySet<TriggerCategory>): TriggerCategory[] {
  return TRIGGER_CATEGORIES.filter((c) => set.has(c));
}

/**
 * Apply one answer (or several, for multi-select questions) to a ScoringInput. Pure: returns new objects.
 * Throws RangeError for an unknown question or option, more than one answer to a single-choice question,
 * or an exclusive option combined with others.
 */
export function applyAnswer(
  scoringInput: ScoringInput,
  question: string | { id: string },
  answer: string | readonly string[],
  opts: ApplyOptions = {},
): AppliedAnswer {
  const id = typeof question === "string" ? question : question.id;
  const def = getQuestionDef(id, opts.bank ?? followUpBank);
  if (!def) throw new RangeError(`Unknown follow-up question: ${id}`);
  const chosen = chosenOptions(def, answer);
  const lex = lexMap(opts.symptoms ?? lexicon.symptoms);
  const protect = new Set(opts.protectedSymptomIds ?? []);

  let input = scoringInput;
  const added: string[] = [];
  const negated: string[] = [];
  const cats = new Set<TriggerCategory>();
  const surfaces = new Set<Surface>();
  const notes: string[] = [];
  for (const o of chosen) {
    const r = applyEffects(input, o.effects, lex, protect);
    input = r.input;
    for (const x of r.negated) {
      if (!negated.includes(x)) negated.push(x);
      const i = added.indexOf(x);
      if (i >= 0) added.splice(i, 1);
    }
    for (const x of r.added) {
      if (!added.includes(x)) added.push(x);
      const i = negated.indexOf(x);
      if (i >= 0) negated.splice(i, 1);
    }
    if (o.effects.addTriggerCategory) cats.add(o.effects.addTriggerCategory);
    for (const s of o.surfaces) surfaces.add(s);
    if (o.note) notes.push(o.note);
  }
  if (def.sud) surfaces.add("part2-notice");
  return {
    scoringInput: { ...input, symptomIds: [...input.symptomIds] },
    addedSymptomIds: added,
    negatedSymptomIds: negated,
    triggerCategories: orderCategories(cats),
    surfaces: orderSurfaces(surfaces),
    notes,
    record: { questionId: def.id, answerIds: chosen.map((o) => o.id) },
    keepOpen: chosen.every((o) => o.keepOpen),
  };
}

/** Last record per question, in the order of those last records. */
function latestRecords(answered: readonly AnsweredRecord[]): AnsweredRecord[] {
  const lastIndex = new Map<string, number>();
  answered.forEach((r, i) => lastIndex.set(r.questionId, i));
  return answered.filter((r, i) => lastIndex.get(r.questionId) === i);
}

/**
 * Fold every answer over the base input (chips + text matches), in order. Pure. Records with unknown ids
 * are skipped and reported in `invalid` instead of throwing, so stale UI state can never break the screen.
 * Recompute from the base input on every render; never feed the result back in as the new base.
 */
export function applyAnswers(baseInput: ScoringInput, answered: readonly AnsweredRecord[], opts: ApplyOptions = {}): FoldedAnswers {
  let input: ScoringInput = { ...baseInput, symptomIds: uniq(baseInput.symptomIds) };
  const negated = new Set<string>();
  const cats = new Set<TriggerCategory>();
  const surfaces = new Set<Surface>();
  const notes: string[] = [];
  const invalid: AnsweredRecord[] = [];
  const applied: AnsweredRecord[] = [];
  for (const rec of latestRecords(answered)) {
    let r: AppliedAnswer;
    try {
      r = applyAnswer(input, rec.questionId, rec.answerIds, opts);
    } catch {
      invalid.push(rec);
      continue;
    }
    input = r.scoringInput;
    for (const x of r.negatedSymptomIds) negated.add(x);
    for (const x of r.addedSymptomIds) negated.delete(x);
    for (const c of r.triggerCategories) cats.add(c);
    for (const s of r.surfaces) surfaces.add(s);
    for (const n of r.notes) if (!notes.includes(n)) notes.push(n);
    applied.push(r.record);
  }
  const base = new Set(baseInput.symptomIds);
  return {
    scoringInput: input,
    addedSymptomIds: input.symptomIds.filter((id) => !base.has(id)),
    negatedSymptomIds: [...negated].filter((id) => !input.symptomIds.includes(id)),
    triggerCategories: orderCategories(cats),
    surfaces: orderSurfaces(surfaces),
    notes,
    invalid,
    applied,
  };
}

/* ------------------------------------------------------------------ signals */

interface Signals {
  input: ScoringInput;
  result: ScoringResult;
  present: ReadonlySet<string>;
  absent: ReadonlySet<string>;
  symptomCats: ReadonlySet<string>;
  redFlags: ReadonlySet<RedFlagType>;
  trigCats: ReadonlySet<TriggerCategory>;
  cues: ReadonlySet<TriggerCueKind>;
  hits: readonly TriggerHit[];
  top: readonly Suggestion[];
  topIds: readonly string[];
  answers: ReadonlyMap<string, ReadonlySet<string>>;
  closed: ReadonlySet<string>;
  anySignal: boolean;
  lex: ReadonlyMap<string, Symptom>;
  conditions: readonly Condition[];
  symptoms: readonly Symptom[];
  conditionById: ReadonlyMap<string, Condition>;
  bank: readonly FollowUpQuestionDef[];
}

function buildSignals(ctx: FollowUpContext, opts: EngineOptions): Signals {
  const bank = opts.bank ?? followUpBank;
  const symptoms = opts.symptoms ?? lexicon.symptoms;
  const conditions = opts.conditions ?? defaultConditions;
  const lex = lexMap(symptoms);
  const present = new Set(ctx.scoringInput.symptomIds);

  // Answers: latest record per question; negations from answers count as "known absent".
  const answers = new Map<string, Set<string>>();
  const closed = new Set<string>();
  const absent = new Set<string>(ctx.absentSymptomIds ?? []);
  for (const rec of latestRecords(ctx.answered)) {
    const def = getQuestionDef(rec.questionId, bank);
    if (!def) continue;
    const chosen = def.options.filter((o) => rec.answerIds.includes(o.id));
    if (chosen.length === 0) continue;
    answers.set(def.id, new Set(chosen.map((o) => o.id)));
    if (chosen.some((o) => !o.keepOpen)) closed.add(def.id);
    for (const o of chosen) {
      for (const id of o.effects.negateSymptomIds ?? []) absent.add(id);
      for (const id of o.effects.addSymptomIds ?? []) absent.delete(id);
    }
  }
  for (const id of present) absent.delete(id);

  const symptomCats = new Set<string>();
  const redFlags = new Set<RedFlagType>(ctx.scoringResult.redFlags.map((r) => r.type));
  for (const id of present) {
    const s = lex.get(id);
    if (!s) continue;
    symptomCats.add(s.category);
    if (s.redFlag) redFlags.add(s.redFlag);
  }

  const hits = ctx.triggers.filter((h) => !h.negated);
  const trigCats = new Set<TriggerCategory>([...triggerCategoriesOf(hits), ...(ctx.triggerCategories ?? [])]);
  const cues = new Set<TriggerCueKind>(hits.map((h) => h.cue));
  const top = ctx.scoringResult.suggestions.slice(0, 3);
  return {
    input: ctx.scoringInput,
    result: ctx.scoringResult,
    present,
    absent,
    symptomCats,
    redFlags,
    trigCats,
    cues,
    hits,
    top,
    topIds: top.map((s) => s.conditionId),
    answers,
    closed,
    anySignal: present.size > 0 || trigCats.size > 0,
    lex,
    conditions,
    symptoms,
    conditionById: new Map(conditions.map((c) => [c.id, c] as const)),
    bank,
  };
}

const some = <T,>(xs: readonly T[] | undefined, pred: (x: T) => boolean) => (xs ?? []).some(pred);

function triggerMatch(def: FollowUpQuestionDef, sig: Signals): boolean {
  return some(def.showWhen.triggerCategories, (c) => sig.trigCats.has(c)) || some(def.showWhen.triggerCues, (c) => sig.cues.has(c));
}

function shows(def: FollowUpQuestionDef, sig: Signals): boolean {
  return matches(def.showWhen, sig) && (!def.alsoRequires || matches(def.alsoRequires, sig));
}

function matches(w: ShowWhen, sig: Signals): boolean {
  const viaTrigger =
    some(w.triggerCategories, (c) => sig.trigCats.has(c)) || some(w.triggerCues, (c) => sig.cues.has(c));
  return (
    viaTrigger ||
    some(w.symptomIds, (id) => sig.present.has(id)) ||
    some(w.symptomCategories, (c) => sig.symptomCats.has(c)) ||
    some(w.conditionIds, (id) => sig.topIds.includes(id)) ||
    some(w.redFlags, (f) => sig.redFlags.has(f)) ||
    (w.substanceYes === true && sig.input.substancePossible === "yes") ||
    (w.medicalYes === true && sig.input.medicalPossible === "yes") ||
    some(w.answered, (ref) => some(ref.answerIds, (a) => sig.answers.get(ref.questionId)?.has(a) === true)) ||
    (w.anySignal === true && sig.anySignal)
  );
}

function gateKnown(gate: GateField, input: ScoringInput): boolean {
  switch (gate) {
    case "duration":
      return input.duration !== "unknown";
    case "impairment":
      return input.impairment !== "unknown";
    case "substance":
      return input.substancePossible !== "unknown";
    case "medical":
      return input.medicalPossible !== "unknown";
  }
}

/** The trigger hit a question is about: one of the categories or cues it was written for, else none. */
function triggerFor(def: FollowUpQuestionDef, sig: Signals): { hit: TriggerHit; phrase: string; category: TriggerCategory } | null {
  const cats = def.showWhen.triggerCategories ?? [];
  const cues = def.showWhen.triggerCues ?? [];
  if (cats.length === 0 && cues.length === 0) return null;
  const relevant = sig.hits.filter(
    (h) => cats.includes(h.category) || (h.baseCategory !== undefined && cats.includes(h.baseCategory)) || cues.includes(h.cue),
  );
  const first = relevant[0];
  if (!first) return null;
  const phrases = uniq(relevant.map((h) => h.phrase.toLowerCase())).slice(0, 2);
  const category = first.baseCategory && cats.includes(first.baseCategory) ? first.baseCategory : first.category;
  return { hit: first, phrase: phrases.join(" or "), category };
}

/** Category-label fallback for <trigger> when an answer added the category but no phrase was typed. */
function categoryFallback(def: FollowUpQuestionDef, sig: Signals): string {
  const cat = (def.showWhen.triggerCategories ?? []).find((c) => sig.trigCats.has(c));
  return cat ? triggerDictionary.categories[cat].label.toLowerCase() : "the feared object or situation";
}

function visibleOptions(def: FollowUpQuestionDef, hasTrigger: boolean): AnswerOption[] {
  return def.options.filter((o) => !o.when || (o.when === "trigger") === hasTrigger);
}

/* ------------------------------------------------------------------ ranking */

interface Candidate {
  def: FollowUpQuestionDef;
  tier: 0 | 1 | 2 | 3;
  value: number;
  reasons: WhyReason[];
  trig: ReturnType<typeof triggerFor>;
}

const scoreMap = (r: ScoringResult) => new Map(r.suggestions.map((s) => [s.conditionId, s.score] as const));
const hasEffect = (e: AnswerEffects) => Object.values(e).some((v) => (Array.isArray(v) ? v.length > 0 : v !== undefined));

/** Short lowercase form of a lexicon label for "why asked" text ("Context: a traumatic event ..." -> "a traumatic event ..."). */
function shortLabel(id: string, sig: Signals, fallback = id): string {
  const label = (sig.lex.get(id)?.label ?? fallback).replace(/^context:\s*/i, "");
  return (label.split(/[:;(,]/)[0] ?? label).trim().toLowerCase();
}

function conditionName(id: string, sig: Signals): string {
  return sig.top.find((s) => s.conditionId === id)?.name ?? sig.conditionById.get(id)?.name ?? id;
}

function listNames(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * How far the answers would move candidate scores apart. Each answer option with effects is applied to a
 * copy of the input and re-scored; options without effects count as "no change" (the current scores).
 */
function simulate(def: FollowUpQuestionDef, sig: Signals, hasTrigger: boolean): { value: number; reason?: WhyReason } {
  const options = visibleOptions(def, hasTrigger).filter((o) => !o.keepOpen);
  const withEffects = options.filter((o) => hasEffect(o.effects));
  if (withEffects.length === 0) return { value: 0 };
  const base = scoreMap(sig.result);
  const outcomes = withEffects.map((o) => {
    const r = applyEffects(sig.input, o.effects, sig.lex, new Set());
    return scoreMap(scoreConditions(r.input, sig.conditions as Condition[], sig.symptoms as Symptom[]));
  });
  if (withEffects.length < options.length) outcomes.push(base);
  if (outcomes.length < 2) outcomes.push(base);

  const ids = [...new Set(outcomes.flatMap((m) => [...m.keys()]))].sort();
  let best = { id: "", spread: 0, min: 0, max: 0 };
  for (const id of ids) {
    const scores = outcomes.map((m) => m.get(id) ?? 0);
    const min = Math.min(...scores);
    const max = Math.max(...scores);
    if (max - min > best.spread) best = { id, spread: max - min, min, max };
  }
  let marginRange = 0;
  const [a, b] = sig.top;
  if (a && b) {
    const margins = outcomes.map((m) => (m.get(a.conditionId) ?? 0) - (m.get(b.conditionId) ?? 0));
    marginRange = Math.max(...margins) - Math.min(...margins);
  }
  const leaders = new Set(
    outcomes.map((m) => {
      let lead = "";
      let s = -1;
      for (const [id, v] of [...m.entries()].sort((x, y) => (x[0] < y[0] ? -1 : 1))) if (v > s) [lead, s] = [id, v];
      return lead;
    }),
  );
  const value = Math.min(50, Math.round(best.spread * 0.4 + marginRange * 0.3 + (leaders.size > 1 ? 10 : 0)));
  if (value <= 0 || !best.id) return { value: 0 };
  const name = conditionName(best.id, sig);
  return {
    value,
    reason: {
      kind: "simulation",
      text: `Depending on the answer, ${name} could score anywhere from ${best.min} to ${best.max}.`,
    },
  };
}

const GATE_BASE: Record<GateField, number> = { duration: 30, impairment: 25, medical: 15, substance: 10 };
const GATE_LABEL: Record<GateField, string> = {
  duration: "Duration is not recorded",
  impairment: "Distress or impairment is not recorded",
  medical: "Medical causes have not been considered yet",
  substance: "Substance and medication effects have not been considered yet",
};

function gateUsers(gate: GateField, sig: Signals): string[] {
  return sig.top
    .filter((s) => {
      if (gate === "duration" || gate === "impairment") return s.flags.some((f) => f.type === gate);
      const cond = sig.conditionById.get(s.conditionId);
      return cond?.ruleOuts.some((r) => r.type === gate) ?? false;
    })
    .map((s) => s.name);
}

function safetySignals(def: FollowUpQuestionDef, sig: Signals): string {
  const parts: string[] = [];
  const flags = (def.showWhen.redFlags ?? []).filter((f) => sig.redFlags.has(f));
  if (flags.length) parts.push(`a red flag is documented (${flags.join(", ")})`);
  const cats: readonly string[] = def.showWhen.symptomCategories ?? [];
  // Lexicon order, not input order: the explanation must not depend on how the symptoms were entered.
  const ids = sig.symptoms
    .map((x) => x.id)
    .filter((id) => sig.present.has(id) && (def.showWhen.symptomIds?.includes(id) || cats.includes(sig.lex.get(id)?.category ?? "")));
  const labels = ids
    .filter((id) => !sig.lex.get(id)?.redFlag)
    .slice(0, 3)
    .map((id) => shortLabel(id, sig));
  if (labels.length) parts.push(`documented: ${labels.join("; ")}`);
  if (triggerMatch(def, sig)) parts.push("a fear tied to a frightening event was described");
  if (def.showWhen.substanceYes && sig.input.substancePossible === "yes") parts.push("substances may be involved");
  const answered = (def.showWhen.answered ?? []).filter((ref) => ref.answerIds.some((a) => sig.answers.get(ref.questionId)?.has(a)));
  if (answered.length) parts.push("an earlier answer calls for it");
  const conds = (def.showWhen.conditionIds ?? []).filter((id) => sig.topIds.includes(id)).map((id) => conditionName(id, sig));
  if (conds.length && parts.length === 0) parts.push(`${listNames(conds)} is among the possible considerations`);
  return parts.length ? `${parts.join("; ")}.` : "safety signals are present.";
}

function rank(def: FollowUpQuestionDef, sig: Signals): Candidate | null {
  const trig = triggerFor(def, sig);
  const hasTrigger = trig !== null;
  const trigOn = triggerMatch(def, sig);
  const reasons: WhyReason[] = [];
  const triggerText = () => {
    const where = trig ? `"${trig.phrase}" (${triggerDictionary.categories[trig.category].label.toLowerCase()})` : categoryFallback(def, sig);
    return `A feared object or situation was described: ${where}.`;
  };

  if (def.kind === "safety") {
    const s = safetySignals(def, sig);
    reasons.push({ kind: "safety", text: `Asked first because ${s} The app records only what you choose and never estimates risk.` });
    return { def, tier: 0, value: 100 - def.priority, reasons, trig };
  }

  if (def.kind === "discriminate") {
    let value = 0;
    if (trigOn) {
      value += 30;
      reasons.push({ kind: "trigger", text: triggerText() });
      if (sig.result.status !== "ok") {
        value += 15;
        reasons.push({
          kind: "insufficient",
          text: "Nothing in the knowledge base matches yet; this answer can make the picture informative.",
        });
      }
    }
    const declared = def.discriminates.filter((id) => sig.topIds.includes(id));
    if (declared.length) {
      value += 12 * declared.length;
      const names = declared.map((id) => conditionName(id, sig));
      reasons.push({
        kind: "discriminate",
        text: names.length > 1 ? `Helps tell apart ${listNames(names)}.` : `Bears on ${names[0]}, one of the current considerations.`,
      });
    }
    const sim = simulate(def, sig, hasTrigger);
    value += sim.value;
    if (sim.reason) reasons.push(sim.reason);
    if (value === 0) {
      value = 5;
      reasons.push({ kind: "signal", text: "Something documented makes this question relevant." });
    }
    return { def, tier: 1, value, reasons, trig };
  }

  if (def.kind === "gate") {
    const gate = def.gate as GateField;
    const users = gateUsers(gate, sig);
    const sim = simulate(def, sig, hasTrigger);
    const value = GATE_BASE[gate] + 10 * users.length + (trigOn ? 3 : 0) + Math.round(sim.value / 2);
    const plural = users.length > 1;
    const tail =
      gate === "duration" || gate === "impairment"
        ? `${plural ? "depend" : "depends"} on it (no adjustment until it is)`
        : `${plural ? "list" : "lists"} ${gate === "medical" ? "medical causes" : "substance or medication effects"} to rule out`;
    reasons.push({ kind: "gate", text: users.length ? `${GATE_LABEL[gate]}; ${listNames(users)} ${tail}.` : `${GATE_LABEL[gate]}.` });
    if (trigOn) reasons.push({ kind: "trigger", text: triggerText() });
    if (sim.reason) reasons.push(sim.reason);
    return { def, tier: 2, value, reasons, trig };
  }

  // core
  let value = 0;
  for (const [i, s] of sig.top.entries()) {
    const missingCore = s.missing.filter((f) => f.kind === "core" && def.targets.includes(f.symptomId));
    if (missingCore.length) {
      value += i === 0 ? 40 : 25;
      const labels = missingCore.map((f) => shortLabel(f.symptomId, sig, f.label));
      reasons.push({ kind: "missing-core", text: `A key feature of ${s.name} is not documented yet: ${labels.join("; ")}.` });
      break;
    }
  }
  if (value === 0) {
    const s = sig.top.find((x) => x.missing.some((f) => def.targets.includes(f.symptomId)));
    if (s) {
      value += 10;
      reasons.push({ kind: "missing-core", text: `A supporting feature of ${s.name} is not documented yet.` });
    }
  }
  if (trigOn) {
    value += 15;
    reasons.push({ kind: "trigger", text: triggerText() });
  }
  if (value === 0) return null; // nothing missing to ask about right now
  const sim = simulate(def, sig, hasTrigger);
  value += Math.round(sim.value / 2);
  if (sim.reason) reasons.push(sim.reason);
  return { def, tier: 3, value, reasons, trig };
}

function compare(a: Candidate, b: Candidate): number {
  return a.tier - b.tier || b.value - a.value || a.def.priority - b.def.priority || (a.def.id < b.def.id ? -1 : a.def.id > b.def.id ? 1 : 0);
}

function render(c: Candidate, sig: Signals): FollowUpQuestion {
  const { def, trig } = c;
  const hasTrigger = trig !== null;
  const fill = (s: string) => s.split(TRIGGER_TOKEN).join(trig ? trig.phrase : categoryFallback(def, sig));
  const text = fill(hasTrigger ? def.text : (def.textNoTrigger ?? def.text));
  const options: RenderedOption[] = visibleOptions(def, hasTrigger).map((o) => ({
    id: o.id,
    label: fill(hasTrigger ? o.label : (o.labelNoTrigger ?? o.label)),
    surfaces: [...o.surfaces],
    keepOpen: o.keepOpen,
    exclusive: o.exclusive,
    ...(o.note ? { note: fill(o.note) } : {}),
  }));
  const q: FollowUpQuestion = {
    id: def.id,
    kind: def.kind,
    domain: def.domain,
    select: def.select,
    text,
    why: fill(def.why),
    whyAsked: c.reasons.map((r) => r.text).join(" "),
    reasons: c.reasons,
    options,
    tier: c.tier,
    rankScore: c.value,
    discriminates: def.discriminates.filter((id) => sig.conditionById.has(id)).map((id) => ({ conditionId: id, name: conditionName(id, sig) })),
    sud: def.sud,
    label: REVIEW_LABEL,
  };
  if (trig) q.trigger = { category: trig.category, objectId: trig.hit.objectId, phrase: trig.phrase };
  if (def.sud) q.part2Notice = PART2_NOTICE;
  return q;
}

/**
 * Up to `limit` (default 5) follow-up questions, ranked and explained. Pure and deterministic.
 * Returns [] in client mode.
 */
export function nextQuestions(ctx: FollowUpContext, opts: EngineOptions = {}): FollowUpQuestion[] {
  if (opts.mode === "client") return [];
  const limit = Math.max(0, Math.min(MAX_LIMIT, Math.floor(opts.limit ?? DEFAULT_LIMIT)));
  if (limit === 0) return [];
  const sig = buildSignals(ctx, opts);

  const candidates: Candidate[] = [];
  for (const def of sig.bank) {
    if (sig.closed.has(def.id)) continue;
    if (!shows(def, sig)) continue;
    if (def.gate && gateKnown(def.gate, sig.input)) continue;
    if (def.targets.length > 0 && def.targets.every((id) => sig.present.has(id) || sig.absent.has(id))) continue;
    const hasTrigger = triggerFor(def, sig) !== null;
    if (!visibleOptions(def, hasTrigger).some((o) => !o.keepOpen)) continue;
    const c = rank(def, sig);
    if (c) candidates.push(c);
  }
  candidates.sort(compare);

  const picked: Candidate[] = [];
  const groups = new Set<string>();
  const take = (pred: (c: Candidate) => boolean, max: number) => {
    let n = 0;
    for (const c of candidates) {
      if (picked.length >= limit || n >= max) break;
      if (picked.includes(c) || !pred(c)) continue;
      if (c.def.group && groups.has(c.def.group)) continue;
      picked.push(c);
      if (c.def.group) groups.add(c.def.group);
      n++;
    }
  };
  take((c) => c.tier === 0, 3);
  // Strong discriminators first (a weak one, relevant only through a documented signal, waits for the fill).
  take((c) => c.tier === 1 && c.value >= STRONG_DISCRIMINATOR, picked.length > 0 ? 2 : 3);
  take((c) => c.tier === 2, 1);
  take((c) => c.tier === 3, 1);
  take(() => true, limit);
  return picked.sort(compare).map((c) => render(c, sig));
}

/* ------------------------------------------------------------------ one-call convenience */

export interface FollowUpSessionInput {
  /** Chips + text matches, before any follow-up answer (what analysis.ts scores today). */
  baseInput: ScoringInput;
  /** Scrubbed text (extractTriggers is run on it), or pre-extracted triggers. */
  scrubbedText?: string;
  triggers?: readonly TriggerHit[];
  answered: readonly AnsweredRecord[];
  absentSymptomIds?: readonly string[];
  /** Chips the clinician selected: answers never negate them. */
  protectedSymptomIds?: readonly string[];
}

export interface FollowUpSession {
  folded: FoldedAnswers;
  scoringInput: ScoringInput;
  scoringResult: ScoringResult;
  triggers: TriggerHit[];
  questions: FollowUpQuestion[];
}

/**
 * Everything the screen needs in one pure call: fold answers, re-score, extract triggers, pick questions.
 * Pass the same `conditions` and `symptoms` the rest of the screen uses.
 */
export function followUpSession(input: FollowUpSessionInput, opts: EngineOptions = {}): FollowUpSession {
  const symptoms = opts.symptoms ?? lexicon.symptoms;
  const conditions = opts.conditions ?? defaultConditions;
  const folded = applyAnswers(input.baseInput, input.answered, {
    bank: opts.bank,
    symptoms,
    protectedSymptomIds: input.protectedSymptomIds,
  });
  const scoringResult = scoreConditions(folded.scoringInput, conditions as Condition[], symptoms as Symptom[]);
  const triggers = input.triggers ? [...input.triggers] : extractTriggers(input.scrubbedText ?? "");
  const questions = nextQuestions(
    {
      scoringInput: folded.scoringInput,
      scoringResult,
      triggers,
      answered: folded.applied,
      absentSymptomIds: [...(input.absentSymptomIds ?? []), ...folded.negatedSymptomIds],
      triggerCategories: folded.triggerCategories,
    },
    { ...opts, symptoms, conditions },
  );
  return { folded, scoringInput: folded.scoringInput, scoringResult, triggers, questions };
}
