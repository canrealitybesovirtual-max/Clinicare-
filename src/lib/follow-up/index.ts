/**
 * Guided follow-up engine: public API (browser-safe, no network, memory-only).
 * catalog.ts (which loads the full content library) is deliberately NOT re-exported here; import it
 * directly where the bundle cost is acceptable (server components, tests).
 */
export {
  extractTriggers,
  objectLabel,
  summarizeTriggers,
  triggerCategoriesOf,
  type ExtractTriggersOptions,
  type TriggerHit,
  type TriggerSummary,
} from "./triggers";
export {
  DEFAULT_LIMIT,
  REVIEW_LABEL,
  answerGateEffects,
  applyAnswer,
  applyAnswers,
  followUpSession,
  nextQuestions,
  type AnsweredRecord,
  type ApplyOptions,
  type AppliedAnswer,
  type EngineOptions,
  type FollowUpContext,
  type FollowUpQuestion,
  type FollowUpSession,
  type FollowUpSessionInput,
  type FoldedAnswers,
  type GateEffects,
  type RenderedOption,
  type WhyKind,
  type WhyReason,
} from "./engine";
export { bankProblems, followUpBank, followUpFiles, getQuestionDef, referencedSymptomIds } from "./bank";
export { triggerDictionary } from "./dictionary";
export { SURFACE_INFO, type SurfaceInfo } from "./surfaces";
export { triggerPatterns, type TriggerPattern, type TriggerPatternOptions } from "./patterns";
export {
  computeResourceHints,
  type ResourceCatalog,
  type ResourceHint,
  type ResourceHintKind,
  type ResourceHintOptions,
  type ResourceHints,
} from "./resources";
