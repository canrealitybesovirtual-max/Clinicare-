/**
 * Loads and validates the follow-up question banks (content/follow-ups/*.json) with zod at module load, so malformed content fails the build and the
 * tests (G10). Static imports only: safe in the browser, no filesystem or network access.
 *
 * bankProblems() cross-checks the banks against the symptom lexicon (every referenced symptom id must
 * exist, red-flag symptoms can never be negated, answer references must resolve). The tests run it, and
 * scripts can too.
 */
import safetyJson from "@content/follow-ups/safety.json";
import panicFearJson from "@content/follow-ups/panic-fear.json";
import worryJson from "@content/follow-ups/worry.json";
import moodJson from "@content/follow-ups/mood.json";
import traumaJson from "@content/follow-ups/trauma.json";
import sleepJson from "@content/follow-ups/sleep.json";
import alcoholJson from "@content/follow-ups/alcohol.json";
import griefJson from "@content/follow-ups/grief.json";
import eatingJson from "@content/follow-ups/eating.json";
import attentionJson from "@content/follow-ups/attention.json";
import psychosisJson from "@content/follow-ups/psychosis.json";
import gatesJson from "@content/follow-ups/gates.json";
import ruleOutsJson from "@content/follow-ups/rule-outs.json";
import type { Symptom } from "@/lib/schemas";
import {
  FollowUpBankFileSchema,
  TRIGGER_TOKEN,
  type FollowUpBankFile,
  type FollowUpQuestionDef,
} from "@/lib/schemas-follow-up";

function parseBank(raw: unknown, file: string): FollowUpBankFile {
  const r = FollowUpBankFileSchema.safeParse(raw);
  if (!r.success) {
    const issues = r.error.issues
      .slice(0, 4)
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    throw new Error(`Invalid follow-up bank content/follow-ups/${file}.json: ${issues}`);
  }
  return r.data;
}

/** Bank files in ranking order of their domains (safety first). */
export const followUpFiles: readonly FollowUpBankFile[] = [
  parseBank(safetyJson, "safety"),
  parseBank(panicFearJson, "panic-fear"),
  parseBank(worryJson, "worry"),
  parseBank(moodJson, "mood"),
  parseBank(traumaJson, "trauma"),
  parseBank(sleepJson, "sleep"),
  parseBank(alcoholJson, "alcohol"),
  parseBank(griefJson, "grief"),
  parseBank(eatingJson, "eating"),
  parseBank(attentionJson, "attention"),
  parseBank(psychosisJson, "psychosis"),
  parseBank(gatesJson, "gates"),
  parseBank(ruleOutsJson, "rule-outs"),
];

/** Every question, in file order. Question ids are unique across files (checked by bankProblems()). */
export const followUpBank: readonly FollowUpQuestionDef[] = followUpFiles.flatMap((f) => f.questions);

const bankIndex = new WeakMap<readonly FollowUpQuestionDef[], Map<string, FollowUpQuestionDef>>();

export function getQuestionDef(id: string, bank: readonly FollowUpQuestionDef[] = followUpBank): FollowUpQuestionDef | undefined {
  let map = bankIndex.get(bank);
  if (!map) {
    map = new Map(bank.map((q) => [q.id, q] as const));
    bankIndex.set(bank, map);
  }
  return map.get(id);
}

/** Every symptom id a bank references (effects, targets, showWhen), sorted. */
export function referencedSymptomIds(bank: readonly FollowUpQuestionDef[] = followUpBank): string[] {
  const ids = new Set<string>();
  for (const q of bank) {
    for (const id of q.targets) ids.add(id);
    for (const id of q.showWhen.symptomIds ?? []) ids.add(id);
    for (const id of q.alsoRequires?.symptomIds ?? []) ids.add(id);
    for (const o of q.options) {
      for (const id of o.effects.addSymptomIds ?? []) ids.add(id);
      for (const id of o.effects.negateSymptomIds ?? []) ids.add(id);
    }
  }
  return [...ids].sort();
}

/**
 * Cross-reference problems (empty when the bank is sound):
 * unknown symptom ids, negation of a red-flag symptom (G9), duplicate question ids, answer references
 * (showWhen.answered) to unknown questions or options, and <trigger> in text of a question that can
 * never have a trigger.
 */
export function bankProblems(
  opts: { bank?: readonly FollowUpQuestionDef[]; symptoms?: readonly Symptom[] } = {},
): string[] {
  const bank = opts.bank ?? followUpBank;
  const problems: string[] = [];
  const lexicon = opts.symptoms ? new Map(opts.symptoms.map((s) => [s.id, s] as const)) : null;
  const seen = new Set<string>();
  for (const q of bank) {
    if (seen.has(q.id)) problems.push(`duplicate question id ${q.id}`);
    seen.add(q.id);
  }
  for (const q of bank) {
    const where = `follow-ups/${q.domain}#${q.id}`;
    if (lexicon) {
      const check = (id: string, field: string) => {
        if (!lexicon.has(id)) problems.push(`${where}: unknown symptom ${id} (${field})`);
      };
      for (const id of q.targets) check(id, "targets");
      for (const id of q.showWhen.symptomIds ?? []) check(id, "showWhen.symptomIds");
      for (const id of q.alsoRequires?.symptomIds ?? []) check(id, "alsoRequires.symptomIds");
      for (const o of q.options) {
        for (const id of o.effects.addSymptomIds ?? []) check(id, `${o.id}.addSymptomIds`);
        for (const id of o.effects.negateSymptomIds ?? []) {
          check(id, `${o.id}.negateSymptomIds`);
          if (lexicon.get(id)?.redFlag) problems.push(`${where}: option ${o.id} negates red-flag symptom ${id} (G9)`);
        }
      }
    }
    for (const ref of [...(q.showWhen.answered ?? []), ...(q.alsoRequires?.answered ?? [])]) {
      const target = bank.find((x) => x.id === ref.questionId);
      if (!target) problems.push(`${where}: showWhen.answered refers to unknown question ${ref.questionId}`);
      else
        for (const a of ref.answerIds)
          if (!target.options.some((o) => o.id === a)) problems.push(`${where}: showWhen.answered refers to unknown option ${ref.questionId}.${a}`);
    }
    const canHaveTrigger = !!(q.showWhen.triggerCategories || q.showWhen.triggerCues);
    if (!canHaveTrigger && (q.text.includes(TRIGGER_TOKEN) || q.why.includes(TRIGGER_TOKEN)))
      problems.push(`${where}: uses ${TRIGGER_TOKEN} but is never shown for a trigger`);
  }
  return problems;
}
