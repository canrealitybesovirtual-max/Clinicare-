/**
 * Audit of EVERY file under content/ (G7, G10, G13). Each file must match a registered schema; an
 * unregistered file is itself a problem, so new content cannot skip validation. Clinical content must
 * carry governance (sources[], license, lastVerified <= today, reviewedBy); non-clinical data and
 * registries are labeled as such and must still name their sources and license. It also collects a report-only
 * review queue: items awaiting clinical sign-off, Spanish text awaiting human review, and old evidence grades.
 *
 * Used by scripts/validate-content.ts (CI) and tests/unit/content-audit.test.ts. Node only.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { z, type ZodType } from "zod";
import {
  ConditionSchema,
  CrisisLinesSchema,
  HandoutSchema,
  LicensesSchema,
  MeasureSchema,
  SourceSchema,
  StatsFileSchema,
  SymptomLexiconSchema,
  isoDate,
} from "../src/lib/schemas";
import { InterventionSchema, PlanLibrarySchema } from "../src/lib/schemas-phase2";
import { ReferralDirectorySchema } from "../src/lib/schemas-referrals";
import { EvidenceQueriesFileSchema, GhoIndicatorsFileSchema } from "../src/lib/schemas-evidence";
import { MedicationsFileSchema } from "../src/lib/schemas-medications";
import { HealthTopicsFileSchema } from "../src/lib/schemas-topics";
import { EthicsCodeSchema, LegalTopicSchema } from "../src/lib/schemas-hub";
import { FollowUpBankFileSchema, TriggerObjectsFileSchema } from "../src/lib/schemas-follow-up";
import { FormulationSchema } from "../src/lib/schemas-formulations";
import { OrientationSchema } from "../src/lib/schemas-orientations";
import { PlanModuleSchema } from "../src/lib/schemas-phase2";
import { PracticeGuideSchema } from "../src/lib/schemas-practice";
import { MedicationEffectsFileSchema } from "../src/lib/schemas-care";
import { PopulationSchema } from "../src/lib/schemas-populations";

/**
 * Non-clinical lookup data (geography tables): no clinical wording, so no clinical review, but they must
 * still say what they are, where they came from, under which license, and when they were extracted or checked.
 */
const DataFileSchema = z
  .object({
    _about: z.string().min(20),
    sources: z.array(SourceSchema).min(1),
    license: z.string().min(2),
    extractedOn: isoDate.optional(),
    lastVerified: isoDate.optional(),
  })
  .refine((d) => d.extractedOn !== undefined || d.lastVerified !== undefined, "needs extractedOn or lastVerified");

/** content/integrations.json: the catalog of external APIs (docs, not clinical content). */
const IntegrationsCatalogSchema = z
  .array(
    z.object({
      name: z.string().min(3),
      category: z.string().min(2),
      endpoint: z.string().min(3), // a URL, or several hosts for link-out rows
      access: z.string().min(3),
      use: z.string().min(3),
      phase: z.union([z.number(), z.string()]),
      privacyRule: z.string().min(5),
    }),
  )
  .min(1);

export type ContentKind = "clinical" | "data" | "registry";

interface Rule {
  match: RegExp;
  schema: ZodType;
  kind: ContentKind;
  /** Field that must equal the file name (without .json). */
  idField?: string;
}

export const RULES: readonly Rule[] = [
  { match: /^symptoms\.json$/, schema: SymptomLexiconSchema, kind: "clinical" },
  { match: /^conditions\/[^/]+\.json$/, schema: ConditionSchema, kind: "clinical", idField: "id" },
  { match: /^measures\/[^/]+\.json$/, schema: MeasureSchema, kind: "clinical", idField: "id" },
  { match: /^handouts\/[^/]+\.json$/, schema: HandoutSchema, kind: "clinical", idField: "id" },
  { match: /^interventions\/[^/]+\.json$/, schema: InterventionSchema, kind: "clinical", idField: "id" },
  { match: /^plans\/[^/]+\.json$/, schema: PlanLibrarySchema, kind: "clinical", idField: "conditionId" },
  { match: /^stats\/stats\.json$/, schema: StatsFileSchema, kind: "clinical" },
  { match: /^medications\.json$/, schema: MedicationsFileSchema, kind: "clinical" },
  { match: /^topics\.json$/, schema: HealthTopicsFileSchema, kind: "clinical" },
  { match: /^evidence-queries\.json$/, schema: EvidenceQueriesFileSchema, kind: "clinical" },
  { match: /^gho-indicators\.json$/, schema: GhoIndicatorsFileSchema, kind: "clinical" },
  { match: /^ethics\/[^/]+\.json$/, schema: EthicsCodeSchema, kind: "clinical", idField: "id" },
  { match: /^legal\/[^/]+\.json$/, schema: LegalTopicSchema, kind: "clinical", idField: "id" },
  { match: /^referrals\/(?:us|international)\.json$/, schema: ReferralDirectorySchema, kind: "clinical" },
  { match: /^crisis-lines\.json$/, schema: CrisisLinesSchema, kind: "clinical" },
  { match: /^follow-ups\/[^/]+\.json$/, schema: FollowUpBankFileSchema, kind: "clinical", idField: "id" },
  { match: /^trigger-objects\.json$/, schema: TriggerObjectsFileSchema, kind: "clinical" },
  { match: /^formulations\/[^/]+\.json$/, schema: FormulationSchema, kind: "clinical", idField: "id" },
  { match: /^orientations\/[^/]+\.json$/, schema: OrientationSchema, kind: "clinical", idField: "id" },
  { match: /^plans\/modules\/[^/]+\.json$/, schema: PlanModuleSchema, kind: "clinical", idField: "id" },
  { match: /^practice\/[^/]+\.json$/, schema: PracticeGuideSchema, kind: "clinical", idField: "id" },
  { match: /^care\/medication-effects\.json$/, schema: MedicationEffectsFileSchema, kind: "clinical", idField: "id" },
  { match: /^populations\/[^/]+\.json$/, schema: PopulationSchema, kind: "clinical", idField: "id" },
  { match: /^referrals\/(?:zcta-centroids|us-places)\.json$/, schema: DataFileSchema, kind: "data" },
  { match: /^licenses\.json$/, schema: LicensesSchema, kind: "registry" },
  { match: /^integrations\.json$/, schema: IntegrationsCatalogSchema, kind: "registry" },
];

export interface AuditResult {
  files: { file: string; kind: ContentKind }[];
  problems: string[];
  warnings: string[];
  /**
   * Report-only review queue (G10): clinical files still waiting for a licensed clinician's sign-off, and files whose
   * Spanish text is machine-assisted and still needs a fluent human review (45 CFR 92.201 asks for human review of
   * machine translation of critical content).
   */
  review: { clinical: string[]; translation: string[]; staleEvidence: string[] };
}

/** An evidence grade older than this many years is listed for re-checking against the body's current guideline. */
export const EVIDENCE_GRADE_MAX_AGE_YEARS = 5;

/**
 * Evidence grades are optional on content items (`evidenceGrades: [{ body, guideline, year, ... }]`). Each one
 * older than EVIDENCE_GRADE_MAX_AGE_YEARS is reported, never failed: an old recommendation can still be current.
 */
function staleEvidenceGrades(file: string, raw: unknown, year: number): string[] {
  const grades = (raw as { evidenceGrades?: unknown }).evidenceGrades;
  if (!Array.isArray(grades)) return [];
  return grades.flatMap((g: { body?: unknown; guideline?: unknown; year?: unknown }) =>
    typeof g.year === "number" && year - g.year > EVIDENCE_GRADE_MAX_AGE_YEARS
      ? [`${file}: ${String(g.body ?? "evidence")} grade (${String(g.guideline ?? "guideline")}, ${g.year}) is over ${EVIDENCE_GRADE_MAX_AGE_YEARS} years old; check the current guideline`]
      : [],
  );
}

/** Machine-assisted Spanish that still needs a person: `es.translatedBy` says PENDING. */
const translationPending = (raw: unknown): boolean => /PENDING/.test(String((raw as { es?: { translatedBy?: unknown } }).es?.translatedBy ?? ""));

function jsonFiles(dir: string, base = dir): string[] {
  return readdirSync(dir)
    .sort()
    .flatMap((name) => {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) return jsonFiles(full, base);
      return name.endsWith(".json") ? [path.relative(base, full).split(path.sep).join("/")] : [];
    });
}

function zodMessage(err: z.ZodError): string {
  return err.issues
    .slice(0, 4)
    .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("; ");
}

/** Every lastVerified value anywhere in the document (ISO dates only). */
function lastVerifiedDates(value: unknown, out: string[] = []): string[] {
  if (Array.isArray(value)) for (const v of value) lastVerifiedDates(v, out);
  else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      if (k === "lastVerified" && typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) out.push(v);
      else lastVerifiedDates(v, out);
    }
  }
  return out;
}

export function auditContent(contentDir: string, opts: { release?: boolean; today?: string } = {}): AuditResult {
  const today = opts.today ?? new Date().toISOString().slice(0, 10);
  const result: AuditResult = { files: [], problems: [], warnings: [], review: { clinical: [], translation: [], staleEvidence: [] } };
  const year = Number(today.slice(0, 4));
  const parsed = new Map<string, unknown>();

  for (const file of jsonFiles(contentDir)) {
    const rule = RULES.find((r) => r.match.test(file));
    if (!rule) {
      result.problems.push(`${file}: no schema registered for this file (add it to scripts/content-audit.ts RULES)`);
      continue;
    }
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(path.join(contentDir, file), "utf8"));
    } catch (e) {
      result.problems.push(`${file}: invalid JSON (${(e as Error).message})`);
      continue;
    }
    const r = rule.schema.safeParse(raw);
    if (!r.success) {
      result.problems.push(`${file}: ${zodMessage(r.error)}`);
      continue;
    }
    result.files.push({ file, kind: rule.kind });
    parsed.set(file, r.data);

    if (rule.idField) {
      const id = (r.data as Record<string, unknown>)[rule.idField];
      const expected = path.basename(file, ".json");
      if (id !== expected) result.problems.push(`${file}: ${rule.idField} "${String(id)}" does not match the file name`);
    }
    for (const d of lastVerifiedDates(raw)) if (d > today) result.problems.push(`${file}: lastVerified ${d} is in the future`);
    if (rule.kind === "clinical" && (raw as { reviewedBy?: unknown }).reviewedBy === "PENDING") result.review.clinical.push(file);
    if (translationPending(raw)) result.review.translation.push(file);
    result.review.staleEvidence.push(...staleEvidenceGrades(file, raw, year));
  }

  // Cross-references among Phase 2 content.
  const ids = (dir: string) =>
    new Set([...parsed.keys()].filter((f) => f.startsWith(`${dir}/`)).map((f) => path.basename(f, ".json")));
  const handoutIds = ids("handouts");
  const interventionIds = ids("interventions");
  const measureIds = ids("measures");
  for (const [file, data] of parsed) {
    if (file.startsWith("interventions/")) {
      for (const h of (data as { handoutIds: string[] }).handoutIds)
        if (!handoutIds.has(h)) result.problems.push(`${file}: unknown handout ${h}`);
    }
    if (file.startsWith("plans/")) {
      for (const p of (data as { problems: { measureIds: string[]; shortTermObjectives: { interventionIds: string[] }[] }[] }).problems) {
        for (const m of p.measureIds) if (!measureIds.has(m)) result.problems.push(`${file}: unknown measure ${m}`);
        for (const o of p.shortTermObjectives)
          for (const i of o.interventionIds) if (!interventionIds.has(i)) result.problems.push(`${file}: unknown intervention ${i}`);
      }
    }
  }

  // G9/G10: crisis numbers shown on every screen must be checked by a person before release.
  const crisis = parsed.get("crisis-lines.json") as
    | { international: { lastVerified: string | null }; countries: { country: string; lastVerified: string | null }[] }
    | undefined;
  if (crisis) {
    const unverified = [
      ...(crisis.international.lastVerified ? [] : ["international"]),
      ...crisis.countries.filter((c) => !c.lastVerified).map((c) => c.country),
    ];
    if (unverified.length) {
      const msg = `crisis-lines.json: not yet verified by a person on the official site: ${unverified.join(", ")}`;
      (opts.release ? result.problems : result.warnings).push(msg);
    }
  }
  return result;
}
