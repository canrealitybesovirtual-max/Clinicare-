import "server-only";
/**
 * The catalog the assistant may point into: a compact, stable, deterministic text built ONLY from app-authored
 * content (symptom labels, condition names + primary ICD-10-CM code, licensed measure names, intervention names +
 * modality, referral kinds, answer-effect vocabulary). Never DSM-5-TR text, never client data.
 *
 * Stability matters: the catalog is the cached prefix of every request (prompt caching is a byte-exact prefix
 * match), so it is sorted by id, built once per process, and contains no timestamps or random values.
 *
 * 42 CFR Part 2: substance-use conditions, the symptoms that only belong to them, interventions used only for
 * them and the "substance-use" referral kind are left OUT. The assistant never receives or proposes them.
 */
import { lexicon, measures } from "@/lib/content";
import { allConditions, interventions, planLibraries } from "@/lib/library";
import { REFERRAL_KINDS, type ReferralKind } from "@/lib/schemas-referrals";
import type { Condition, Symptom } from "@/lib/schemas";

/** Ids that name substance use even when a content file forgets its `sud` flag. */
const SUD_ID = /(?:^|-)(?:alcohol|substance|opioid|cannabis|stimulant|sedative|tobacco|nicotine|hallucinogen|inhalant|intoxication|drug)(?:-|$)/;

export const REFERRAL_KIND_LABELS: Record<ReferralKind, { en: string; es: string }> = {
  crisis: { en: "24/7 crisis lines", es: "Líneas de crisis 24/7" },
  helpline: { en: "Helplines and warmlines", es: "Líneas de ayuda y apoyo" },
  directory: { en: "Therapist and service directories", es: "Directorios de terapeutas y servicios" },
  "low-cost": { en: "Low-cost and sliding-scale care", es: "Atención de bajo costo y escala móvil" },
  "peer-support": { en: "Peer support groups", es: "Grupos de apoyo entre pares" },
  veterans: { en: "Veteran and military services", es: "Servicios para veteranos y militares" },
  "substance-use": { en: "Substance-use services", es: "Servicios para el uso de sustancias" },
  medication: { en: "Medication evaluation and pharmacy help", es: "Evaluación de medicamentos y ayuda con farmacia" },
  lgbtq: { en: "LGBTQ+ affirming services", es: "Servicios afirmativos LGBTQ+" },
  "deaf-hoh": { en: "Deaf and hard-of-hearing access", es: "Acceso para personas sordas o con pérdida auditiva" },
  "violence-and-abuse": { en: "Violence and abuse support", es: "Apoyo ante la violencia y el abuso" },
  perinatal: { en: "Pregnancy and postpartum support", es: "Apoyo durante el embarazo y el posparto" },
  "older-adults-and-caregivers": { en: "Older adults and caregivers", es: "Personas mayores y cuidadores" },
  disability: { en: "Disability and workplace accommodations", es: "Discapacidad y adaptaciones en el trabajo" },
  "basic-needs": { en: "Housing and basic needs", es: "Vivienda y necesidades básicas" },
  indigenous: { en: "Indigenous health services", es: "Servicios de salud indígena" },
};

export interface CatalogFeature {
  symptomId: string;
  label: string;
  kind: "core" | "associated";
  weight: number;
}

export interface CatalogCondition {
  id: string;
  name: string;
  icd10cm: { code: string; label: string };
  icd11: { code: string; label: string };
  dsmPointer: string;
  features: CatalogFeature[];
}

export interface Catalog {
  /** The text sent (cached) as the second system block. */
  text: string;
  symptomIds: ReadonlySet<string>;
  /** Safety-category / red-flag symptoms: answers may add them, never negate them. */
  redFlagSymptomIds: ReadonlySet<string>;
  conditionIds: ReadonlySet<string>;
  measureIds: ReadonlySet<string>;
  interventionIds: ReadonlySet<string>;
  referralKinds: ReadonlySet<ReferralKind>;
  conditions: ReadonlyMap<string, CatalogCondition>;
  measures: ReadonlyMap<string, { id: string; name: string; shortName: string }>;
  interventions: ReadonlyMap<string, { id: string; name: string; modality: string }>;
  /** Everything the INPUT may name (all lexicon ids / all condition ids, SUD ones included, so they can be withheld). */
  allSymptomIds: readonly string[];
  allConditionIds: readonly string[];
  /** Withheld before any request: never sent, never accepted from the model. */
  sudSymptomIds: ReadonlySet<string>;
  sudConditionIds: ReadonlySet<string>;
}

const byId = <T extends { id: string }>(a: T, b: T) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
/** One line per entry: no pipes or line breaks inside a field. */
const field = (s: string) => s.replace(/[\r\n|]+/g, " ").replace(/\s+/g, " ").trim();

function sudConditionIdsOf(conditions: readonly Condition[]): Set<string> {
  const ids = new Set<string>();
  for (const c of conditions) if (c.sud || SUD_ID.test(c.id)) ids.add(c.id);
  for (const p of planLibraries) if (p.sud || SUD_ID.test(p.conditionId)) ids.add(p.conditionId);
  return ids;
}

/** A symptom is substance-use information if it is a withdrawal flag, names a substance, or only SUD patterns use it. */
function sudSymptomIdsOf(symptoms: readonly Symptom[], conditions: readonly Condition[], sudConditions: ReadonlySet<string>): Set<string> {
  const usedBySud = new Set<string>();
  const usedByOther = new Set<string>();
  for (const c of conditions)
    for (const f of c.features) (sudConditions.has(c.id) ? usedBySud : usedByOther).add(f.symptomId);
  const ids = new Set<string>();
  for (const s of symptoms) {
    if (s.redFlag === "withdrawal" || SUD_ID.test(s.id) || (usedBySud.has(s.id) && !usedByOther.has(s.id))) ids.add(s.id);
  }
  return ids;
}

export function buildCatalog(): Catalog {
  const symptoms = [...lexicon.symptoms].sort(byId);
  const conditions = [...allConditions].sort(byId);
  const sudConditionIds = sudConditionIdsOf(conditions);
  const sudSymptomIds = sudSymptomIdsOf(symptoms, conditions, sudConditionIds);

  const symptomList = symptoms.filter((s) => !sudSymptomIds.has(s.id));
  const labelOf = new Map(symptoms.map((s) => [s.id, s.label] as const));

  const conditionList: CatalogCondition[] = conditions
    .filter((c) => !sudConditionIds.has(c.id))
    .map((c) => ({
      id: c.id,
      name: c.name,
      icd10cm: { code: c.icd10cm[0]!.code, label: c.icd10cm[0]!.label },
      icd11: { code: c.icd11[0]!.code, label: c.icd11[0]!.label },
      dsmPointer: c.dsmPointer,
      features: c.features
        .filter((f) => !sudSymptomIds.has(f.symptomId))
        .map((f) => ({ symptomId: f.symptomId, label: labelOf.get(f.symptomId) ?? f.symptomId, kind: f.kind, weight: f.weight })),
    }));

  const measureList = [...measures].sort(byId).map((m) => ({ id: m.id, name: m.name, shortName: m.shortName }));
  const interventionList = [...interventions]
    .filter((i) => !i.conditions.every((c) => sudConditionIds.has(c)))
    .sort(byId)
    .map((i) => ({ id: i.id, name: i.name, modality: i.modality }));
  const kinds = REFERRAL_KINDS.filter((k) => k !== "substance-use");

  const lines: string[] = [
    "CATALOG (app-authored reference labels). These ids are the ONLY ids you may use in any output field.",
    "",
    "SYMPTOMS: id | label | category",
    ...symptomList.map((s) => `${s.id} | ${field(s.label)} | ${s.category}`),
    "",
    "CONDITIONS: id | name | primary ICD-10-CM code",
    ...conditionList.map((c) => `${c.id} | ${field(c.name)} | ${c.icd10cm.code}`),
    "",
    "MEASURES (built-in, license confirmed): id | name",
    ...measureList.map((m) => `${m.id} | ${field(m.name)}`),
    "",
    "INTERVENTIONS: id | name | modality",
    ...interventionList.map((i) => `${i.id} | ${field(i.name)} | ${field(i.modality)}`),
    "",
    "REFERRAL KINDS: kind | meaning",
    ...kinds.map((k) => `${k} | ${REFERRAL_KIND_LABELS[k].en}`),
    "",
    "ANSWER EFFECTS (what clicking an answer option changes in the app; every effect is optional)",
    "addSymptomIds: catalog symptom ids the answer documents as present",
    "negateSymptomIds: catalog symptom ids the answer rules out (never a safety-category symptom)",
    "setDuration: lt2w (under 2 weeks) | 2to4w (2 to 4 weeks) | 1to6m (1 to 6 months) | gte6m (6 months or longer)",
    "setImpairment: yes | no (clinically meaningful effect on daily functioning)",
  ];

  return {
    text: lines.join("\n"),
    symptomIds: new Set(symptomList.map((s) => s.id)),
    redFlagSymptomIds: new Set(symptomList.filter((s) => s.redFlag || s.category === "safety").map((s) => s.id)),
    conditionIds: new Set(conditionList.map((c) => c.id)),
    measureIds: new Set(measureList.map((m) => m.id)),
    interventionIds: new Set(interventionList.map((i) => i.id)),
    referralKinds: new Set(kinds),
    conditions: new Map(conditionList.map((c) => [c.id, c] as const)),
    measures: new Map(measureList.map((m) => [m.id, m] as const)),
    interventions: new Map(interventionList.map((i) => [i.id, i] as const)),
    allSymptomIds: symptoms.map((s) => s.id),
    allConditionIds: conditions.map((c) => c.id),
    sudSymptomIds,
    sudConditionIds,
  };
}

let cached: Catalog | undefined;
/** Built once per process: content is static at runtime, so the cached prompt prefix stays byte-identical. */
export function getCatalog(): Catalog {
  return (cached ??= buildCatalog());
}

/** All red-flag symptom ids in the lexicon (SUD ones included), for the deterministic safety reminder. */
export const LEXICON_RED_FLAG_IDS: ReadonlySet<string> = new Set(lexicon.symptoms.filter((s) => s.redFlag).map((s) => s.id));
