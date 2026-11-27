import "server-only";
/**
 * Owner amendment (CLAUDE.md, 2026-11-27): ONE optional, server-side Claude assistant. OFF by default.
 *
 * It runs only when ALL three are set on the server (never NEXT_PUBLIC_*):
 *   ANTHROPIC_API_KEY      the API key of an Anthropic organization covered by a signed BAA with zero data retention
 *   AI_ASSISTANT_ENABLED   exactly "true"
 *   AI_BAA_CONFIRMED       exactly "true", set by the owner only after the BAA is signed (docs/AI-ASSISTANT.md)
 * Optional:
 *   AI_MODEL               one of ALLOWED_MODELS (default claude-opus-5-5); anything else falls back to the default
 *   AI_EFFORT              one of ALLOWED_EFFORTS (default medium); anything else falls back to the default
 *
 * Nothing here logs, and the key never leaves this module except into the SDK client constructor.
 */

type Env = Readonly<Record<string, string | undefined>>;

export const ASSISTANT_NAME = "The AI assistant";
export const DEFAULT_MODEL = "claude-opus-5-5";
export const DEFAULT_EFFORT = "medium";

/**
 * Current model ids (claude-api skill, shared/models.md) that also support structured outputs AND accept an
 * organization on zero data retention. The Fable / Mythos models are left out on purpose: they require 30-day
 * retention and return a 400 for ZDR organizations, which a BAA deployment must be.
 */
export const ALLOWED_MODELS = ["claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5", "claude-haiku-5-5"] as const;
export type AssistantModel = (typeof ALLOWED_MODELS)[number];

/** xhigh / max are left out: they think longer than the 20 s request budget allows and cost more. */
export const ALLOWED_EFFORTS = ["low", "medium", "high"] as const;
export type AssistantEffort = (typeof ALLOWED_EFFORTS)[number];

/**
 * Models with a documented server-side refusal fallback (`fallbacks: "default"`, beta header
 * server-side-fallback-2026-07-01). Other models run without it; a refusal is still handled.
 */
const MODELS_WITH_DEFAULT_FALLBACK: ReadonlySet<AssistantModel> = new Set<AssistantModel>(["claude-opus-5-5", "claude-opus-5"]);
export const FALLBACK_BETA = "server-side-fallback-2026-07-01";

/** Whole-request budget, including the model's thinking. */
export const REQUEST_TIMEOUT_MS = 20_000;
/** Thinking counts toward max_tokens on these models; the JSON itself is small. */
export const MAX_OUTPUT_TOKENS = 12_000;

export interface AssistantConfig {
  apiKey: string;
  model: AssistantModel;
  effort: AssistantEffort;
  useDefaultFallback: boolean;
}

const isTrue = (v: string | undefined) => v === "true";

/** True only when the key is set AND both owner switches are exactly "true". */
export function isAssistantEnabled(env: Env = process.env): boolean {
  return Boolean(env.ANTHROPIC_API_KEY?.trim()) && isTrue(env.AI_ASSISTANT_ENABLED) && isTrue(env.AI_BAA_CONFIRMED);
}

function pick<T extends string>(value: string | undefined, allowed: readonly T[], fallback: T): T {
  const v = value?.trim();
  return v && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

/** The resolved configuration, or null when the assistant is off. */
export function assistantConfig(env: Env = process.env): AssistantConfig | null {
  if (!isAssistantEnabled(env)) return null;
  const model = pick(env.AI_MODEL, ALLOWED_MODELS, DEFAULT_MODEL);
  return {
    apiKey: env.ANTHROPIC_API_KEY!.trim(),
    model,
    effort: pick(env.AI_EFFORT, ALLOWED_EFFORTS, DEFAULT_EFFORT),
    useDefaultFallback: MODELS_WITH_DEFAULT_FALLBACK.has(model),
  };
}

/**
 * Safe to pass from a SERVER component to the client as props: whether to offer the opt-in at all, and which
 * model would answer. Never includes the key.
 */
export function assistantStatus(env: Env = process.env): { enabled: boolean; model: AssistantModel | null } {
  const cfg = assistantConfig(env);
  return { enabled: cfg !== null, model: cfg?.model ?? null };
}
