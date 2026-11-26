import "server-only";
/**
 * ClinicalTrials.gov REST API v2 (https://clinicaltrials.gov/api/v2/studies, OpenAPI 2.0.5, verified 2026-11-26).
 * - Outbound: ONLY a curated condition term (content/evidence-queries.json -> trials.conditions), the fixed status
 *   RECRUITING, a fixed adult-age filter, and optionally ONE location: a validated US state (outbound.ts UsState,
 *   mapped to its full name) or a curated ClinicalTrials.gov country name (G5, G17). Never typed text.
 *   Location goes out as an Essie expression built only from those curated values: AREA[LocationState]"<state>"
 *   AND AREA[LocationCountry]"United States", or AREA[LocationCountry]"<country>".
 * - Terms: free, no key. NLM publishes no hard limit for v2; we stay at ~45 requests/minute (0.75/s, burst 3),
 *   under the ~50/min/IP figure widely cited for the service, and cache 6 h. Attribution: ClinicalTrials.gov (NLM),
 *   no implied endorsement.
 * - Response is limited with `fields` to identifiers, titles, phases, conditions, intervention names and site
 *   countries/states. No contact names, emails or phone numbers are requested.
 */
import { z } from "zod";
import { US_STATES, UsState, assertNoPHI, curated } from "@/lib/outbound";

type UsStateCode = z.infer<typeof UsState>;
import type { TrialCondition } from "@/lib/schemas-evidence";
import { UpstreamError, setRateLimit, upstreamFetch } from "@/server/core";
import { clip } from "./plain-text";
import { evidenceQueriesFile } from "./pubmed";

/* ---------------- curated values ---------------- */
export const TRIAL_CONDITIONS: Readonly<Record<string, TrialCondition>> = evidenceQueriesFile.trials.conditions;
export const TRIAL_COUNTRIES: readonly string[] = evidenceQueriesFile.trials.countries;
export const TRIALS_ADULT_ONLY = evidenceQueriesFile.trials.adultOnly;

const conditionByKey = new Map<string, string>();
for (const [id, c] of Object.entries(TRIAL_CONDITIONS)) for (const k of [id, c.term]) conditionByKey.set(k.toLowerCase(), id);
/** Every value a caller may send as `condition`: condition ids and their trial terms. */
export const TRIAL_CONDITION_KEYS: readonly string[] = [...new Set(Object.entries(TRIAL_CONDITIONS).flatMap(([id, c]) => [id, c.term]))];

/** Full names as ClinicalTrials.gov stores them. Territories are stored as countries there, not as states. */
export const US_STATE_NAMES: Record<UsStateCode, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado", CT: "Connecticut",
  DE: "Delaware", DC: "District of Columbia", FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois",
  IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana",
  NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York",
  NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania",
  PR: "Puerto Rico", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas",
  UT: "Utah", VT: "Vermont", VA: "Virginia", VI: "Virgin Islands", WA: "Washington", WV: "West Virginia",
  WI: "Wisconsin", WY: "Wyoming", GU: "Guam", AS: "American Samoa", MP: "Northern Mariana Islands",
};
/** US territories that ClinicalTrials.gov records under LocationCountry. */
export const US_TERRITORIES_AS_COUNTRY: ReadonlySet<UsStateCode> = new Set<UsStateCode>(["PR", "VI", "GU", "AS", "MP"]);

/* ---------------- constants ---------------- */
export const TRIALS_UPSTREAM = "clinicaltrials-gov";
export const TRIALS_ENDPOINT = "https://clinicaltrials.gov/api/v2/studies";
export const TRIALS_ATTRIBUTION = "Source: ClinicalTrials.gov (U.S. NLM). Listing does not imply endorsement.";
export const TRIALS_SOURCE = "https://clinicaltrials.gov/";
export const TRIALS_PAGE_SIZE = 10;
export const TRIALS_TTL_MS = 6 * 60 * 60 * 1000;
export const TRIALS_FIELDS = [
  "NCTId",
  "BriefTitle",
  "OverallStatus",
  "Phase",
  "StudyType",
  "Condition",
  "InterventionName",
  "LocationCountry",
  "LocationState",
  "LastUpdatePostDate",
] as const;
export const TRIALS_ADULT_FILTER = "AREA[StdAge]ADULT";

export function configureTrialsRateLimit() {
  setRateLimit(TRIALS_UPSTREAM, 0.75, 3);
}
configureTrialsRateLimit();

/* ---------------- input / output ---------------- */
export const TrialsInput = z
  .strictObject({
    condition: curated(TRIAL_CONDITION_KEYS).transform((k) => conditionByKey.get(k.toLowerCase())!),
    state: UsState.optional(),
    country: curated(TRIAL_COUNTRIES).optional(),
    max: z.number().int().min(1).max(TRIALS_PAGE_SIZE).default(TRIALS_PAGE_SIZE),
  })
  .refine((v) => !(v.state && v.country), { message: "Send a US state or a country, not both", path: ["country"] });
export type TrialsInput = z.input<typeof TrialsInput>;
type ParsedTrialsInput = z.output<typeof TrialsInput>;

export interface TrialStudy {
  nctId: string;
  title: string;
  status: string; // e.g. "Recruiting"
  phase: string; // e.g. "Phase 2/Phase 3", "Not applicable"
  studyType: string | null; // "Interventional" | "Observational" | ...
  conditions: string[]; // <= 8
  interventions: string[]; // intervention names, <= 8
  locationsCount: number; // number of listed sites
  locationsInArea: number | null; // sites in the requested state/country (null when no location was given)
  countries: string[]; // distinct site countries, <= 5
  lastUpdated: string | null; // YYYY-MM-DD
  url: string; // https://clinicaltrials.gov/study/<nctId>
}

export interface TrialsLocation { kind: "state" | "country"; value: string; label: string }

export interface TrialsResult {
  condition: { id: string; label: string; term: string; sud: boolean };
  location: TrialsLocation | null;
  adultOnly: boolean;
  total: number;
  items: TrialStudy[];
  searchUrl: string; // the same search on clinicaltrials.gov (link-out / fallback)
}

/* ---------------- URL builders ---------------- */
function resolveLocation(input: { state?: UsStateCode; country?: string }): TrialsLocation | null {
  if (input.state) {
    const name = US_STATE_NAMES[input.state];
    return US_TERRITORIES_AS_COUNTRY.has(input.state)
      ? { kind: "country", value: name, label: name }
      : { kind: "state", value: name, label: `${name}, United States` };
  }
  if (input.country) return { kind: "country", value: input.country, label: input.country };
  return null;
}

/** Essie location expression built only from curated names (quoted; the names contain no quotes). */
export function locationExpression(loc: TrialsLocation): string {
  return loc.kind === "state"
    ? `AREA[LocationState]"${loc.value}" AND AREA[LocationCountry]"United States"`
    : `AREA[LocationCountry]"${loc.value}"`;
}

/** Exact upstream query parameters for a validated input. Exported for tests. */
export function trialsParams(input: ParsedTrialsInput): URLSearchParams {
  const cond = TRIAL_CONDITIONS[input.condition]!;
  const p = new URLSearchParams({
    format: "json",
    "query.cond": cond.term,
    "filter.overallStatus": "RECRUITING",
  });
  if (TRIALS_ADULT_ONLY) p.set("filter.advanced", TRIALS_ADULT_FILTER);
  const loc = resolveLocation(input);
  if (loc) p.set("query.locn", locationExpression(loc));
  p.set("fields", TRIALS_FIELDS.join(","));
  p.set("pageSize", String(TRIALS_PAGE_SIZE));
  p.set("countTotal", "true");
  return p;
}

export function trialsUrl(input: ParsedTrialsInput): string {
  return `${TRIALS_ENDPOINT}?${trialsParams(input)}`;
}

/** Link-out for the UI when the API is unavailable: the same search on clinicaltrials.gov. */
export function trialsSearchLink(raw: TrialsInput): string {
  const input = TrialsInput.parse(raw);
  const p = new URLSearchParams({ cond: TRIAL_CONDITIONS[input.condition]!.term, aggFilters: TRIALS_ADULT_ONLY ? "ages:adult,status:rec" : "status:rec" });
  const loc = resolveLocation(input);
  if (loc?.kind === "state") {
    p.set("country", "United States");
    p.set("state", loc.value);
  } else if (loc) p.set("country", loc.value);
  return `${TRIALS_SOURCE}search?${p}`;
}

export function trialUrl(nctId: string): string {
  return `${TRIALS_SOURCE}study/${nctId}`;
}

/* ---------------- response parsing ---------------- */
const Str = z.string().max(2000);
const StudySchema = z.object({
  protocolSection: z.object({
    identificationModule: z.object({ nctId: z.string().regex(/^NCT\d{8}$/), briefTitle: Str.optional() }),
    statusModule: z
      .object({ overallStatus: Str.optional(), lastUpdatePostDateStruct: z.object({ date: Str.optional() }).optional() })
      .optional(),
    designModule: z.object({ phases: z.array(Str).optional(), studyType: Str.optional() }).optional(),
    conditionsModule: z.object({ conditions: z.array(Str).optional() }).optional(),
    armsInterventionsModule: z.object({ interventions: z.array(z.object({ name: Str.optional() })).optional() }).optional(),
    contactsLocationsModule: z
      .object({ locations: z.array(z.object({ country: Str.optional(), state: Str.optional() })).optional() })
      .optional(),
  }),
});
const ResponseSchema = z.object({ totalCount: z.number().int().nonnegative().optional(), studies: z.array(z.unknown()) });

const PHASE_LABELS: Record<string, string> = {
  NA: "Not applicable",
  EARLY_PHASE1: "Early Phase 1",
  PHASE1: "Phase 1",
  PHASE2: "Phase 2",
  PHASE3: "Phase 3",
  PHASE4: "Phase 4",
};

/** "NOT_YET_RECRUITING" -> "Not yet recruiting". */
function enumLabel(v: string | undefined): string | null {
  if (!v || !/^[A-Z][A-Z0-9_]{0,40}$/.test(v)) return null;
  const s = v.toLowerCase().replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Plain text: no control characters, collapsed whitespace, clipped. Rendered as text by the UI. */
function plain(s: string | undefined, max: number): string {
  return clip(
    (s ?? "")
      .replace(/[\u0000-\u001f\u007f-\u009f]/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
    max,
  );
}

function uniqPlain(values: (string | undefined)[], cap: number, max = 120): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const t = plain(v, max);
    if (!t || seen.has(t.toLowerCase())) continue;
    seen.add(t.toLowerCase());
    out.push(t);
    if (out.length >= cap) break;
  }
  return out;
}

/** Normalise the API JSON into studies. Exported for tests. */
export function parseTrials(body: unknown, loc: TrialsLocation | null): { total: number; items: TrialStudy[] } {
  const parsed = ResponseSchema.safeParse(body);
  if (!parsed.success) throw new UpstreamError(TRIALS_UPSTREAM, 502, "Unexpected response from upstream service");
  const items: TrialStudy[] = [];
  const seen = new Set<string>();
  for (const raw of parsed.data.studies) {
    const s = StudySchema.safeParse(raw);
    if (!s.success) continue;
    const ps = s.data.protocolSection;
    const nctId = ps.identificationModule.nctId;
    if (seen.has(nctId)) continue;
    seen.add(nctId);
    const locations = ps.contactsLocationsModule?.locations ?? [];
    const phases = (ps.designModule?.phases ?? []).map((p) => PHASE_LABELS[p]).filter((p): p is string => !!p);
    const inArea = loc
      ? locations.filter((l) =>
          loc.kind === "state" ? l.state === loc.value && l.country === "United States" : l.country === loc.value,
        ).length
      : null;
    const updated = ps.statusModule?.lastUpdatePostDateStruct?.date;
    items.push({
      nctId,
      title: plain(ps.identificationModule.briefTitle, 300) || nctId,
      status: enumLabel(ps.statusModule?.overallStatus) ?? "Unknown",
      phase: phases.length ? [...new Set(phases)].join("/") : "Not reported",
      studyType: enumLabel(ps.designModule?.studyType),
      conditions: uniqPlain(ps.conditionsModule?.conditions ?? [], 8),
      interventions: uniqPlain((ps.armsInterventionsModule?.interventions ?? []).map((i) => i.name), 8),
      locationsCount: locations.length,
      locationsInArea: inArea,
      countries: uniqPlain(locations.map((l) => l.country), 5, 60),
      lastUpdated: updated && /^\d{4}-\d{2}(?:-\d{2})?$/.test(updated) ? updated : null,
      url: trialUrl(nctId),
    });
    if (items.length >= TRIALS_PAGE_SIZE) break;
  }
  return { total: parsed.data.totalCount ?? items.length, items };
}

/* ---------------- adapter ---------------- */
/** Recruiting adult trials for one curated condition, optionally in one US state or country. */
export async function searchTrials(raw: TrialsInput): Promise<TrialsResult> {
  const input = TrialsInput.parse(raw);
  const cond = TRIAL_CONDITIONS[input.condition]!;
  const params = trialsParams(input);
  for (const v of params.values()) assertNoPHI(v);
  const loc = resolveLocation(input);
  let body: unknown;
  try {
    body = await upstreamFetch<unknown>(`${TRIALS_ENDPOINT}?${params}`, { upstream: TRIALS_UPSTREAM, ttlMs: TRIALS_TTL_MS, timeoutMs: 10_000 });
  } catch (e) {
    if (e instanceof UpstreamError) throw e;
    throw new UpstreamError(TRIALS_UPSTREAM, 502, "Unexpected response from upstream service"); // e.g. non-JSON body
  }
  const { total, items } = parseTrials(body, loc);
  return {
    condition: { id: input.condition, label: cond.label, term: cond.term, sud: cond.sud },
    location: loc,
    adultOnly: TRIALS_ADULT_ONLY,
    total,
    items: items.slice(0, input.max),
    searchUrl: trialsSearchLink(raw),
  };
}

/** Exposed for UIs that build a state picker. */
export const TRIAL_STATES: readonly UsStateCode[] = US_STATES;
