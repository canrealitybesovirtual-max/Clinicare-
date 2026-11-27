import "server-only";
/**
 * assistFollowUp(): the optional Claude assistant (owner amendment, CLAUDE.md 2026-11-27).
 *
 * Data flow (docs/AI-ASSISTANT.md):
 *   1. Off unless ANTHROPIC_API_KEY + AI_ASSISTANT_ENABLED=true + AI_BAA_CONFIRMED=true (NotConfigured otherwise).
 *   2. Strict input: curated ids, enums, at most 1500 chars of text the browser already PHI-scrubbed, and an
 *      answered history that only verifies when it echoes server-issued, sealed text (src/server/ai/seal.ts).
 *   3. The server re-runs the PHI scrubber on the text, plus a stricter lower-case name / spelled-out number check,
 *      and REFUSES (OutboundRejected) if any identifier remains. Text that quotes or cites diagnostic-manual criteria
 *      or treatment-planner text is refused too (ReferenceTextWithheld). Nothing is sent.
 *   4. 42 CFR Part 2: text that mentions alcohol or drug use is refused (SubstanceUseWithheld); substance-related
 *      symptom / condition ids, substance-related answers and the substancePossible flag are held back.
 *   5. One request: frozen system prompt + cached catalog; the user message carries only the scrubbed text,
 *      curated ids, enums and sealed history. Structured outputs; server-side refusal fallback where documented.
 *   6. The model's JSON is validated with zod and every id not in the catalog is dropped. Model text is reduced to
 *      plain Latin-script text and DROPPED when it holds a link, an identifier, a statistic, an echo of the
 *      instructions, substance content, a diagnosis statement, criteria / DSM talk or a risk grade. Answer labels
 *      never name a condition. Output is limited to questions + curated ids (owner amendment): no condition list.
 *   7. The result is labeled "For clinician review". The safety reminder is fixed app wording, added whenever a
 *      red flag is documented or the model raised one; the assistant never decides risk.
 * Nothing is logged, persisted or cached; no message threads.
 */
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod"; // guardrail-ok: G16 owner amendment
import { z } from "zod";
import { lexicon } from "@/lib/content";
import { matchSymptoms } from "@/lib/matcher";
import { OutboundRejected } from "@/lib/outbound";
import { scrubPHI } from "@/lib/phi-scrubber";
import type { ReferralKind } from "@/lib/schemas-referrals";
import { NotConfigured, UpstreamError } from "@/server/core";
import { LEXICON_RED_FLAG_IDS, REFERRAL_KIND_LABELS, getCatalog, type Catalog } from "./catalog";
import { anthropicClient, mapSdkError, UPSTREAM, type AssistantClient, type BetaCreateParams, type BetaMessage } from "./client";
import { ASSISTANT_NAME, FALLBACK_BETA, MAX_OUTPUT_TOKENS, REQUEST_TIMEOUT_MS, assistantConfig, type AssistantConfig } from "./config";
import {
  cleanQuestionId,
  looksLikeReferenceText,
  lowercaseIdentifier,
  mentionsCondition,
  mentionsSubstanceUse,
  sanitizeModelText,
  setConditionNames,
} from "./guards";
import { DISCLAIMER, SAFETY_PROMPT, SYSTEM_PROMPT, userMessage } from "./prompt";
import {
  AssistInput,
  ModelAnswer,
  ModelOutputSchema,
  ModelQuestion,
  OUTPUT_LIMITS,
  type AssistAnswer,
  type AssistInputParsed,
  type AssistQuestion,
  type AssistResult,
} from "./schemas";
import { sealAnswer, verifySeal } from "./seal";

/** Text mentions alcohol or drug use: never sent (42 CFR Part 2). A subclass so generic handlers still refuse it. */
export class SubstanceUseWithheld extends OutboundRejected {
  constructor() {
    super("substance-use information is never sent to the assistant");
    this.name = "SubstanceUseWithheld";
  }
}

/** Text that quotes or cites diagnostic-manual criteria or treatment-planner text: never sent (owner amendment). */
export class ReferenceTextWithheld extends OutboundRejected {
  constructor() {
    super("reference-manual text is never sent to the assistant");
    this.name = "ReferenceTextWithheld";
  }
}

export interface AssistDeps {
  /** Injected in tests; defaults to the real SDK client for the configured key. */
  client?: AssistantClient;
  env?: Readonly<Record<string, string | undefined>>;
}

/** Built once: the structured-output JSON schema (the zod parse function is not used; the server validates itself). */
const OUTPUT_FORMAT = (() => {
  const { parse: _unused, ...format } = betaZodOutputFormat(ModelOutputSchema);
  void _unused;
  return format;
})();

/** For tests and docs: the exact schema sent as output_config.format. */
export const outputFormatForTests = OUTPUT_FORMAT;

// Answer labels never name a condition, and diagnosis checks cover every catalog condition name.
setConditionNames([...getCatalog().conditions.values()].map((c) => c.name));

/* ---------------- request side ---------------- */
interface Prepared {
  state: {
    lang: "en" | "es";
    clinicianText: string;
    symptomIds: string[];
    duration: AssistInputParsed["duration"];
    impairment: AssistInputParsed["impairment"];
    medicalPossible: AssistInputParsed["medicalPossible"];
    candidateConditionIds: string[];
    answered: { questionId: string; question: string; answer: string }[];
  };
  redFlag: boolean;
  withheld: boolean;
  droppedAnswers: number;
}

/** Same scrubber as the browser, plus the stricter assistant-only re-check. Throws before anything is sent. */
function assertNoIdentifiers(...values: string[]) {
  for (const v of values) if (v && (scrubPHI(v).findings.length > 0 || lowercaseIdentifier(v))) throw new OutboundRejected("identifier detected");
}

function prepare(input: AssistInputParsed, cat: Catalog, apiKey: string): Prepared {
  const text = input.text.trim();
  assertNoIdentifiers(text);
  if (looksLikeReferenceText(text)) throw new ReferenceTextWithheld();

  const textMatches = text ? matchSymptoms(text, lexicon.symptoms).matches.map((m) => m.symptomId) : [];
  if (mentionsSubstanceUse(text) || textMatches.some((id) => cat.sudSymptomIds.has(id))) throw new SubstanceUseWithheld();

  let withheld = input.substancePossible === "yes";
  const symptomIds: string[] = [];
  for (const id of new Set(input.symptomIds)) {
    if (cat.symptomIds.has(id)) symptomIds.push(id);
    else withheld = true; // the input schema only admits lexicon ids, so this is a substance-related one
  }
  const candidateConditionIds: string[] = [];
  for (const id of new Set(input.candidateConditionIds)) {
    if (cat.conditionIds.has(id)) candidateConditionIds.push(id);
    else withheld = true;
  }

  // Only history the server itself issued (sealed) is forwarded; anything else is dropped unread.
  const answered: Prepared["state"]["answered"] = [];
  const seenIds = new Set<string>();
  let droppedAnswers = 0;
  for (const a of input.answered) {
    const fields = { questionId: a.questionId, questionText: a.questionText, answerLabel: a.answerLabel };
    if (!verifySeal(apiKey, fields, a.seal) || seenIds.has(a.questionId)) {
      droppedAnswers++;
      continue;
    }
    // Defense in depth: sealed text was sanitized when issued; re-check it as if it were new.
    const both = `${a.questionText} ${a.answerLabel}`;
    if (mentionsSubstanceUse(both)) {
      withheld = true;
      continue;
    }
    assertNoIdentifiers(a.questionText, a.answerLabel);
    if (looksLikeReferenceText(both)) throw new ReferenceTextWithheld();
    seenIds.add(a.questionId);
    answered.push({ questionId: a.questionId, question: a.questionText, answer: a.answerLabel });
  }

  const redFlag = [...input.symptomIds, ...textMatches].some((id) => LEXICON_RED_FLAG_IDS.has(id));
  return {
    state: {
      lang: input.lang,
      clinicianText: text,
      symptomIds,
      duration: input.duration,
      impairment: input.impairment,
      medicalPossible: input.medicalPossible,
      candidateConditionIds,
      answered,
    },
    redFlag,
    withheld,
    droppedAnswers,
  };
}

/** Exported for tests: the exact request the SDK receives. */
export function buildRequest(cfg: AssistantConfig, cat: Catalog, state: Prepared["state"]): BetaCreateParams {
  return {
    model: cfg.model,
    max_tokens: MAX_OUTPUT_TOKENS,
    system: [
      { type: "text", text: SYSTEM_PROMPT },
      { type: "text", text: cat.text, cache_control: { type: "ephemeral" } },
    ],
    messages: [{ role: "user", content: userMessage(state) }],
    output_config: { effort: cfg.effort, format: OUTPUT_FORMAT },
    ...(cfg.useDefaultFallback ? { betas: [FALLBACK_BETA], fallbacks: "default" as const } : {}),
  };
}

/* ---------------- response side ---------------- */
const Lenient = z.object({
  questions: z.array(z.unknown()).catch([]),
  resources: z
    .object({
      measureIds: z.array(z.unknown()).catch([]),
      interventionIds: z.array(z.unknown()).catch([]),
      referralKinds: z.array(z.unknown()).catch([]),
    })
    .catch({ measureIds: [], interventionIds: [], referralKinds: [] }),
  safetyPrompt: z.unknown().optional(),
});

function pickIds(raw: readonly unknown[], allowed: ReadonlySet<string>, max: number, exclude?: ReadonlySet<string>): string[] {
  const out: string[] = [];
  for (const v of raw) {
    if (out.length >= max) break;
    if (typeof v === "string" && allowed.has(v) && !exclude?.has(v) && !out.includes(v)) out.push(v);
  }
  return out;
}

type AnswerDraft = Omit<AssistAnswer, "seal">;

function sanitizeAnswer(raw: z.infer<typeof ModelAnswer>, cat: Catalog): AnswerDraft | null {
  const label = sanitizeModelText(raw.label, OUTPUT_LIMITS.answerChars);
  // An answer option is an observation the clinician records, never a condition to pick.
  if (!label || mentionsCondition(label)) return null;
  const add = pickIds(raw.addSymptomIds, cat.symptomIds, OUTPUT_LIMITS.effectsPerAnswer);
  // An assistant answer can document a red flag but never clear one.
  const negate = pickIds(raw.negateSymptomIds, cat.symptomIds, OUTPUT_LIMITS.effectsPerAnswer, cat.redFlagSymptomIds);
  const both = new Set(add.filter((id) => negate.includes(id)));
  const answer: AnswerDraft = {
    label,
    addSymptomIds: add.filter((id) => !both.has(id)),
    negateSymptomIds: negate.filter((id) => !both.has(id)),
  };
  if (raw.setDuration) answer.setDuration = raw.setDuration;
  if (raw.setImpairment) answer.setImpairment = raw.setImpairment;
  return answer;
}

function sanitizeQuestions(raw: readonly unknown[], cat: Catalog, answeredIds: ReadonlySet<string>, apiKey: string): AssistQuestion[] {
  const out: AssistQuestion[] = [];
  const ids = new Set<string>();
  raw.forEach((item, i) => {
    if (out.length >= OUTPUT_LIMITS.questions) return;
    const q = ModelQuestion.safeParse(item);
    if (!q.success) return;
    const text = sanitizeModelText(q.data.text, OUTPUT_LIMITS.questionChars);
    if (!text) return;
    const why = sanitizeModelText(q.data.why, OUTPUT_LIMITS.whyChars) ?? "";
    const id = cleanQuestionId(q.data.id, i);
    if (answeredIds.has(id) || ids.has(id)) return;
    const answers: AssistAnswer[] = [];
    const labels = new Set<string>();
    for (const a of q.data.answers) {
      if (answers.length >= OUTPUT_LIMITS.answersPerQuestion) break;
      const clean = sanitizeAnswer(a, cat);
      if (!clean || labels.has(clean.label.toLowerCase())) continue;
      labels.add(clean.label.toLowerCase());
      answers.push({ ...clean, seal: sealAnswer(apiKey, { questionId: id, questionText: text, answerLabel: clean.label }) });
    }
    if (answers.length < 2) return; // a question needs real choices
    ids.add(id);
    out.push({ id, text, why, answers });
  });
  return out;
}

function textOf(msg: BetaMessage): string {
  // After a server-side fallback, only what follows the last fallback block is the serving model's answer.
  const blocks = msg.content;
  let start = 0;
  blocks.forEach((b, i) => {
    if (b.type === "fallback") start = i + 1;
  });
  return blocks
    .slice(start)
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("");
}

function labelsFor(r: AssistResult["resources"], cat: Catalog, lang: "en" | "es"): AssistResult["resourceLabels"] {
  return {
    measures: Object.fromEntries(r.measureIds.map((id) => [id, cat.measures.get(id)!.name])),
    interventions: Object.fromEntries(
      r.interventionIds.map((id) => {
        const i = cat.interventions.get(id)!;
        return [id, { name: i.name, modality: i.modality }];
      }),
    ),
    referralKinds: Object.fromEntries(r.referralKinds.map((k) => [k, REFERRAL_KIND_LABELS[k][lang]])),
  };
}

function baseResult(model: string, prepared: Prepared, lang: "en" | "es", fallbackUsed: boolean): AssistResult {
  return {
    label: "For clinician review",
    generatedBy: "Claude (Anthropic)",
    model,
    status: "ok",
    fallbackUsed,
    questions: [],
    resources: { measureIds: [], interventionIds: [], referralKinds: [] },
    resourceLabels: { measures: {}, interventions: {}, referralKinds: {} },
    ...(prepared.redFlag ? { safetyPrompt: SAFETY_PROMPT[lang] } : {}),
    substanceInfoWithheld: prepared.withheld,
    droppedAnswers: prepared.droppedAnswers,
    disclaimer: DISCLAIMER[lang],
  };
}

/* ---------------- entry point ---------------- */
export async function assistFollowUp(rawInput: unknown, deps: AssistDeps = {}): Promise<AssistResult> {
  const cfg = assistantConfig(deps.env ?? process.env);
  if (!cfg) throw new NotConfigured(ASSISTANT_NAME);
  const input = AssistInput.parse(rawInput);
  const cat = getCatalog();
  const prepared = prepare(input, cat, cfg.apiKey);
  const lang = input.lang;

  const client = deps.client ?? anthropicClient(cfg.apiKey);
  let msg: BetaMessage;
  try {
    msg = await client.beta.messages.create(buildRequest(cfg, cat, prepared.state), {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      timeout: REQUEST_TIMEOUT_MS,
      maxRetries: 0,
    });
  } catch (e) {
    throw mapSdkError(e);
  }

  const fallbackUsed = (msg.usage?.iterations ?? []).some((it) => it.type === "fallback_message");
  const servedBy = typeof msg.model === "string" && /^claude-[a-z0-9-]{1,40}$/.test(msg.model) ? msg.model : cfg.model;
  const result = baseResult(servedBy, prepared, lang, fallbackUsed);

  // Branch on stop_reason before reading content. A refusal (after any fallback) is a normal, empty answer.
  if (msg.stop_reason === "refusal") return { ...result, status: "declined" };
  if (msg.stop_reason === "max_tokens") throw new UpstreamError(UPSTREAM, 502, "The assistant's answer was cut off. Try again.");

  let json: unknown;
  try {
    json = JSON.parse(textOf(msg));
  } catch {
    throw new UpstreamError(UPSTREAM, 502, "The assistant returned an unexpected response.");
  }
  const parsed = Lenient.safeParse(json);
  if (!parsed.success) throw new UpstreamError(UPSTREAM, 502, "The assistant returned an unexpected response.");
  const out = parsed.data;

  const questions = sanitizeQuestions(out.questions, cat, new Set(prepared.state.answered.map((a) => a.questionId)), cfg.apiKey);
  const resources: AssistResult["resources"] = {
    measureIds: pickIds(out.resources.measureIds, cat.measureIds, OUTPUT_LIMITS.measures),
    interventionIds: pickIds(out.resources.interventionIds, cat.interventionIds, OUTPUT_LIMITS.interventions),
    referralKinds: pickIds(out.resources.referralKinds, cat.referralKinds as ReadonlySet<string>, OUTPUT_LIMITS.referralKinds) as ReferralKind[],
  };
  const modelRaisedSafety = typeof out.safetyPrompt === "string" && out.safetyPrompt.trim().length > 0;

  return {
    ...result,
    questions,
    resources,
    resourceLabels: labelsFor(resources, cat, lang),
    ...(prepared.redFlag || modelRaisedSafety ? { safetyPrompt: SAFETY_PROMPT[lang] } : {}),
  };
}

/** For tests: whether a given schema value would pass the strict input contract. */
export const AssistInputSchema = AssistInput;
export type { AssistResult } from "./schemas";
