"use client";
/**
 * Location search for referrals (spec screen 7): licensed providers (CMS NPPES), sliding-fee health centers (HRSA)
 * and treatment facilities (SAMHSA FindTreatment.gov), through our own /api routes only.
 *
 * Privacy (G5, G17, docs/RESOURCES.md): the only things sent are a curated search type and a location that is
 * EITHER a 5-digit ZIP OR a city + state, validated in the browser with src/lib/outbound.ts. The city field runs
 * through the PHI scrubber (useScrubbedField). The ZIP field accepts digits only and is not scrubbed, because a
 * ZIP is itself the one location identifier the search is allowed to send. Everything lives in component memory,
 * is never put in a URL, title or storage, and is cleared by "Clear session" (remount on resetCount).
 */
import * as React from "react";
import { Loader2, RefreshCw, Search } from "lucide-react";
import { callApi } from "@/lib/api-client";
import type { Location } from "@/lib/outbound";
import {
  describeLocation,
  findTreatmentLink,
  healthCenterLink,
  providerRegistryLink,
  type FinderLink,
} from "@/lib/referral-links";
import type { ProvidersResult } from "@/server/integrations/nppes";
import type { HealthCentersResult } from "@/server/integrations/hrsa";
import type { TreatmentFacilitiesResult } from "@/server/integrations/findtreatment";
import { useSession } from "@/state/session";
import { Button } from "@/components/ui/button";
import { ChoiceGroup } from "@/components/ui/choice-group";
import { ExternalLink } from "@/components/ui/external-link";
import { Notice } from "@/components/ui/notice";
import { PRIVATE_TEXT_FIELD_PROPS } from "@/components/ui/private-field";
import { useScrubbedField } from "@/components/symptoms/use-scrubbed-field";
import { cn } from "@/lib/utils";
import { checkLocation, type LocationMode } from "./location-check";
import { useSearchSettings } from "./search-context";
import {
  FACILITY_TYPE_OPTIONS,
  PAGE_SIZE,
  PROVIDER_TYPE_OPTIONS,
  RADIUS_OPTIONS,
  SEARCH_MODES,
  SEARCH_MODE_LABELS,
  STATE_OPTIONS,
  providerOption,
  type FacilityTypeId,
  type ProviderTypeId,
  type RadiusOption,
} from "./search-options";
import { EndorsementNote, FacilityCard, FinderFallback, HealthCenterCard, ProviderCard } from "./search-results";

/* ------------------------------------------------------------------ query model */

type Query =
  | { mode: "providers"; location: Location; providerType: ProviderTypeId }
  | { mode: "health-centers"; location: Location; radiusMiles: RadiusOption }
  | { mode: "treatment-facilities"; location: Location; facilityType: FacilityTypeId; radiusMiles: RadiusOption };

type Success =
  | { mode: "providers"; query: Query; data: ProvidersResult; attribution: string; source: string }
  | { mode: "health-centers"; query: Query; data: HealthCentersResult; attribution: string; source: string }
  | { mode: "treatment-facilities"; query: Query; data: TreatmentFacilitiesResult; attribution: string; source: string };

interface Failure {
  code: string;
  message: string;
  fallbackUrl?: string;
}

type Outcome =
  | { status: "idle" }
  | { status: "loading"; query: Query; previous: Success | null }
  | { status: "success"; result: Success; moreError: Failure | null; loadingMore: boolean }
  | { status: "error"; query: Query; error: Failure };

/** Exported for tests: is this search about substance use care (42 CFR Part 2 prompt)? */
export function isSudQuery(q: Pick<Query, "mode"> & { providerType?: string; facilityType?: string }): boolean {
  if (q.mode === "providers") return q.providerType === "addiction-counselor";
  if (q.mode === "treatment-facilities") return q.facilityType !== "mental-health";
  return false;
}

/** Exact request bodies the routes accept (strict schemas: no other keys). */
export function requestBody(q: Query, next?: number): Record<string, unknown> {
  switch (q.mode) {
    case "providers":
      return { providerType: q.providerType, location: q.location, limit: PAGE_SIZE.providers, skip: next ?? 0 };
    case "health-centers":
      return { location: q.location, radiusMiles: q.radiusMiles, limit: PAGE_SIZE["health-centers"] };
    case "treatment-facilities":
      return {
        location: q.location,
        facilityType: q.facilityType,
        radiusMiles: q.radiusMiles,
        page: next ?? 1,
        pageSize: PAGE_SIZE["treatment-facilities"],
      };
  }
}

function finderFor(q: Query, fallbackUrl?: string): FinderLink {
  const base =
    q.mode === "providers"
      ? providerRegistryLink(q.location)
      : q.mode === "health-centers"
        ? healthCenterLink(q.location)
        : findTreatmentLink(q.location);
  return fallbackUrl && /^https:\/\//.test(fallbackUrl) ? { ...base, url: fallbackUrl } : base;
}

function nextPage(r: Success): number | null {
  if (r.mode === "providers") return r.data.nextSkip;
  if (r.mode === "treatment-facilities") return r.data.page < r.data.totalPages ? r.data.page + 1 : null;
  return null;
}

function countOf(r: Success): number {
  if (r.mode === "providers") return r.data.results.length;
  if (r.mode === "health-centers") return r.data.sites.length;
  return r.data.facilities.length;
}

/** Append the next page to the current result (dedupe providers by NPI). */
function merge(prev: Success, next: Success): Success {
  if (prev.mode === "providers" && next.mode === "providers") {
    const seen = new Set(prev.data.results.map((p) => p.npi));
    return { ...next, data: { ...next.data, results: [...prev.data.results, ...next.data.results.filter((p) => !seen.has(p.npi))] } };
  }
  if (prev.mode === "treatment-facilities" && next.mode === "treatment-facilities") {
    return { ...next, data: { ...next.data, facilities: [...prev.data.facilities, ...next.data.facilities] } };
  }
  return next;
}

function describeQuery(q: Query): string {
  const where = describeLocation(q.location);
  if (q.mode === "providers") return `${providerOption(q.providerType).label} near ${where}`;
  if (q.mode === "health-centers") return `Health centers within ${q.radiusMiles} miles of ${where}`;
  const type = FACILITY_TYPE_OPTIONS.find((f) => f.id === q.facilityType)!.label.toLowerCase();
  return `Treatment facilities (${type}) within ${q.radiusMiles} miles of ${where}`;
}

/** Plain, original copy for each error code. Server messages are safe to show (they never echo input). */
export function errorCopy(e: Failure): { title: string; body: string; retry: boolean; fallback: boolean } {
  switch (e.code) {
    case "not-configured":
      return {
        title: "Live search is not available on this server",
        body: "Use the official finder below instead. It opens in a new tab, and you enter the location there.",
        retry: false,
        fallback: true,
      };
    case "rate-limited":
      return {
        title: "Too many searches in a short time",
        body: "Wait about 10 seconds, then try again. The official finder below works too.",
        retry: true,
        fallback: true,
      };
    case "network":
      return {
        title: "You appear to be offline",
        body: "Live search needs a connection. Crisis numbers and the directories on this page still work.",
        retry: true,
        fallback: true,
      };
    case "invalid":
      return {
        title: "That location was not recognized",
        body: "Check the city's USPS spelling (letters only, no accents), or enter a 5-digit ZIP code instead.",
        retry: false,
        fallback: false,
      };
    case "rejected":
      return {
        title: "That search could not be sent",
        body: "Only a ZIP code, or a city and state, can be sent. Try a ZIP code.",
        retry: false,
        fallback: false,
      };
    default:
      return {
        title: "The search service did not respond",
        body: e.message || "Try again in a moment, or use the official finder below.",
        retry: true,
        fallback: true,
      };
  }
}

/* ------------------------------------------------------------------ component */

export function ReferralSearch({ sudPrompt }: { sudPrompt: React.ReactNode }) {
  const { resetCount } = useSession();
  // Remount on Clear session / idle wipe so the location, results and drafts are cleared too.
  return <ReferralSearchInner key={resetCount} sudPrompt={sudPrompt} />;
}

const selectClass = "min-h-11 w-full rounded-lg border border-border bg-surface px-3 text-base text-text sm:text-sm";
const inputClass =
  "block min-h-11 w-full rounded-lg border border-border bg-surface px-3 text-base text-text placeholder:text-muted/80 aria-[invalid=true]:border-crisis";

function ReferralSearchInner({ sudPrompt }: { sudPrompt: React.ReactNode }) {
  const settings = useSearchSettings();
  const { mode, providerType, facilityType, healthCenterRadius, facilityRadius, update, presetNotice, focusLocation } = settings;

  const [locMode, setLocMode] = React.useState<LocationMode>("zip");
  const [zip, setZip] = React.useState("");
  const [city, setCity] = React.useState("");
  const cityField = useScrubbedField<HTMLInputElement>(city, setCity);
  const [stateCode, setStateCode] = React.useState("");
  const [fieldError, setFieldError] = React.useState<{ field: "zip" | "city" | "state"; message: string } | null>(null);
  const [outcome, setOutcome] = React.useState<Outcome>({ status: "idle" });
  const abortRef = React.useRef<AbortController | null>(null);
  const zipRef = React.useRef<HTMLInputElement>(null);
  const stateRef = React.useRef<HTMLSelectElement>(null);

  const ids = React.useId();
  const fid = (s: string) => `${ids}-${s}`;

  React.useEffect(() => {
    focusLocation.current = () => {
      const el = locMode === "zip" ? zipRef.current : cityField.ref.current;
      el?.scrollIntoView({ block: "center" });
      el?.focus({ preventScroll: true });
    };
    return () => {
      focusLocation.current = null;
    };
  }, [cityField.ref, focusLocation, locMode]);

  React.useEffect(() => () => abortRef.current?.abort(), []);

  const selectionIsSud = isSudQuery({ mode, providerType, facilityType });

  async function run(query: Query, append: boolean) {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    const previous = outcome.status === "success" ? outcome.result : null;
    const next = append && previous ? nextPage(previous) : null;
    if (append && previous) setOutcome({ status: "success", result: previous, moreError: null, loadingMore: true });
    else setOutcome({ status: "loading", query, previous });

    const res = await callApi<unknown>(query.mode, requestBody(query, next ?? undefined), ac.signal);
    if (ac.signal.aborted) return;
    if (!res.ok) {
      const raw = res as { error?: string; code?: string; fallbackUrl?: unknown };
      const error: Failure = {
        code: raw.code ?? "upstream",
        message: raw.error ?? "",
        fallbackUrl: typeof raw.fallbackUrl === "string" ? raw.fallbackUrl : undefined,
      };
      if (append && previous) setOutcome({ status: "success", result: previous, moreError: error, loadingMore: false });
      else setOutcome({ status: "error", query, error });
      return;
    }
    const result = { mode: query.mode, query, data: res.data, attribution: res.attribution, source: res.source } as Success;
    setOutcome({ status: "success", result: append && previous ? merge(previous, result) : result, moreError: null, loadingMore: false });
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    cityField.flushNow();
    const check = checkLocation(locMode, { zip, city: cityField.draft, state: stateCode });
    if (!check.ok) {
      setFieldError({ field: check.field, message: check.message });
      if (check.identifier) cityField.replace(cityField.draft); // show the scrubbed text and the removal notice
      const el = check.field === "zip" ? zipRef.current : check.field === "state" ? stateRef.current : cityField.ref.current;
      el?.focus();
      return;
    }
    setFieldError(null);
    const location = check.location;
    const query: Query =
      mode === "providers"
        ? { mode, location, providerType }
        : mode === "health-centers"
          ? { mode, location, radiusMiles: healthCenterRadius }
          : { mode, location, facilityType, radiusMiles: facilityRadius };
    void run(query, false);
  }

  const loading = outcome.status === "loading" || (outcome.status === "success" && outcome.loadingMore);
  const errId = fid("err");
  const invalid = (f: "zip" | "city" | "state") => fieldError?.field === f;

  return (
    <div className="space-y-5">
      <form onSubmit={onSubmit} noValidate className="space-y-5" aria-describedby={fid("privacy")}>
        <ChoiceGroup
          legend="What to find"
          name={fid("mode")}
          value={mode}
          options={SEARCH_MODES.map((m) => ({ value: m, label: SEARCH_MODE_LABELS[m] }))}
          onChange={(v) => update({ mode: v })}
        />

        <div className="grid gap-4 md:grid-cols-2">
          {mode === "providers" ? (
            <div className="flex flex-col gap-1 md:col-span-2">
              <label htmlFor={fid("ptype")} className="text-sm font-semibold">
                Provider type
              </label>
              <select
                id={fid("ptype")}
                value={providerType}
                onChange={(e) => update({ providerType: e.target.value as ProviderTypeId })}
                className={selectClass}
              >
                {PROVIDER_TYPE_OPTIONS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted">Searches the public CMS NPI Registry by taxonomy. No ratings or reviews.</p>
            </div>
          ) : null}
          {mode === "treatment-facilities" ? (
            <div className="flex flex-col gap-1">
              <label htmlFor={fid("ftype")} className="text-sm font-semibold">
                Type of treatment
              </label>
              <select
                id={fid("ftype")}
                value={facilityType}
                onChange={(e) => update({ facilityType: e.target.value as FacilityTypeId })}
                className={selectClass}
              >
                {FACILITY_TYPE_OPTIONS.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          {mode !== "providers" ? (
            <div className="flex flex-col gap-1">
              <label htmlFor={fid("radius")} className="text-sm font-semibold">
                Distance
              </label>
              <select
                id={fid("radius")}
                value={mode === "health-centers" ? healthCenterRadius : facilityRadius}
                onChange={(e) => {
                  const r = Number(e.target.value) as RadiusOption;
                  update(mode === "health-centers" ? { healthCenterRadius: r } : { facilityRadius: r });
                }}
                className={selectClass}
              >
                {RADIUS_OPTIONS.map((r) => (
                  <option key={r} value={r}>
                    Within {r} miles
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </div>

        <ChoiceGroup
          legend="Location"
          name={fid("locmode")}
          value={locMode}
          options={[
            { value: "zip", label: "ZIP code" },
            { value: "city", label: "City and state" },
          ]}
          onChange={(v) => {
            setLocMode(v);
            setFieldError(null);
          }}
        />
        <p id={fid("privacy")} className="-mt-3 text-sm text-muted">
          Location is sent only as a ZIP or city/state — never anything else. US locations only.
        </p>

        {locMode === "zip" ? (
          <div className="max-w-xs">
            <label htmlFor={fid("zip")} className="text-sm font-semibold">
              ZIP code
            </label>
            <input
              id={fid("zip")}
              ref={zipRef}
              type="text"
              inputMode="numeric"
              pattern="[0-9]{5}"
              maxLength={5}
              value={zip}
              onChange={(e) => setZip(e.target.value.replace(/\D/g, "").slice(0, 5))}
              aria-invalid={invalid("zip") || undefined}
              aria-describedby={invalid("zip") ? errId : undefined}
              {...PRIVATE_TEXT_FIELD_PROPS}
              placeholder="5 digits"
              className={cn(inputClass, "mt-1.5")}
            />
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,14rem)]">
            <div>
              <label htmlFor={fid("city")} className="text-sm font-semibold">
                City
              </label>
              <p id={fid("cityhint")} className="mt-0.5 text-xs text-muted">
                USPS spelling, letters only, no accents (for example St. Louis or Canon City).
              </p>
              <input
                id={fid("city")}
                ref={cityField.ref}
                type="text"
                maxLength={40}
                value={cityField.draft}
                onChange={(e) => cityField.setDraft(e.target.value)}
                onBlur={cityField.flushNow}
                aria-invalid={invalid("city") || undefined}
                aria-describedby={cn(fid("cityhint"), invalid("city") && errId)}
                {...PRIVATE_TEXT_FIELD_PROPS}
                className={cn(inputClass, "mt-1.5")}
              />
              <div role="alert">
                {cityField.removed ? (
                  <p className="mt-2 text-sm font-medium text-warn-fg">
                    Possible identifier removed ({cityField.removed.map((r) => r.label).join(", ")}). Some city names are
                    also first names; search by ZIP code instead.
                  </p>
                ) : null}
              </div>
            </div>
            <div>
              <label htmlFor={fid("state")} className="text-sm font-semibold">
                State or territory
              </label>
              <p className="mt-0.5 text-xs text-muted" aria-hidden>
                &nbsp;
              </p>
              <select
                id={fid("state")}
                ref={stateRef}
                value={stateCode}
                onChange={(e) => setStateCode(e.target.value)}
                aria-invalid={invalid("state") || undefined}
                aria-describedby={invalid("state") ? errId : undefined}
                className={cn(selectClass, "mt-1.5")}
              >
                <option value="">Choose…</option>
                {STATE_OPTIONS.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {fieldError ? (
          <p id={errId} className="text-sm font-semibold text-crisis">
            {fieldError.message}
          </p>
        ) : null}

        {selectionIsSud ? sudPrompt : null}

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" size="lg" disabled={loading}>
            {loading ? <Loader2 aria-hidden className="animate-spin" /> : <Search aria-hidden />}
            {loading ? "Searching…" : "Search"}
          </Button>
          <p className="text-xs text-muted">Results are public listings. Nothing about the client is sent or stored.</p>
        </div>
      </form>

      <p role="status" aria-live="polite" className="text-sm font-medium">
        {statusText(outcome, presetNotice)}
      </p>

      <Results outcome={outcome} sudPrompt={sudPrompt} onRetry={(q, append) => void run(q, append)} />
    </div>
  );
}

function statusText(outcome: Outcome, presetNotice: string | null): string {
  switch (outcome.status) {
    case "idle":
      return presetNotice ?? "";
    case "loading":
      return "Searching…";
    case "error":
      return `${errorCopy(outcome.error).title}.`;
    case "success": {
      if (outcome.loadingMore) return "Loading more results…";
      if (outcome.moreError) return `${errorCopy(outcome.moreError).title}.`;
      const n = countOf(outcome.result);
      return n === 0 ? "No listings found. Try a larger distance or a nearby ZIP code." : `Showing ${n} result${n === 1 ? "" : "s"}.`;
    }
  }
}

/* ------------------------------------------------------------------ results */

function ErrorPanel({ query, error, onRetry }: { query: Query; error: Failure; onRetry?: () => void }) {
  const copy = errorCopy(error);
  return (
    <Notice tone={error.code === "not-configured" ? "info" : "warn"} title={copy.title}>
      <p>{copy.body}</p>
      {copy.retry && onRetry ? (
        <Button type="button" variant="outline" size="sm" className="mt-1 min-h-11" onClick={onRetry}>
          <RefreshCw aria-hidden />
          Try again
        </Button>
      ) : null}
      {copy.fallback ? <FinderFallback finder={finderFor(query, error.fallbackUrl)} className="mt-2 space-y-1.5" /> : null}
    </Notice>
  );
}

function Results({
  outcome,
  sudPrompt,
  onRetry,
}: {
  outcome: Outcome;
  sudPrompt: React.ReactNode;
  onRetry: (q: Query, append: boolean) => void;
}) {
  if (outcome.status === "idle") return null;
  if (outcome.status === "loading") {
    return (
      <div aria-busy="true" className="space-y-3">
        <div className="h-24 animate-pulse rounded-xl bg-surface-2" />
        <div className="h-24 animate-pulse rounded-xl bg-surface-2" />
      </div>
    );
  }
  if (outcome.status === "error") {
    const q = outcome.query;
    return (
      <section aria-labelledby="ref-results-heading" className="space-y-3">
        <h3 id="ref-results-heading" className="text-lg font-semibold">
          {describeQuery(q)}
        </h3>
        {isSudQuery(q as Parameters<typeof isSudQuery>[0]) ? sudPrompt : null}
        <ErrorPanel query={q} error={outcome.error} onRetry={() => onRetry(q, false)} />
      </section>
    );
  }

  const r = outcome.result;
  const q = r.query;
  const more = nextPage(r);
  const n = countOf(r);
  const sud = isSudQuery(q as Parameters<typeof isSudQuery>[0]);
  const part2 = r.mode === "health-centers" ? null : r.data.part2Notice;

  return (
    <section aria-labelledby="ref-results-heading" aria-busy={outcome.loadingMore || undefined} className="space-y-4">
      <div>
        <h3 id="ref-results-heading" className="text-lg font-semibold">
          {describeQuery(q)}
        </h3>
        <p className="text-sm text-muted">
          {n} result{n === 1 ? "" : "s"}
          {r.mode === "treatment-facilities" && r.data.recordCount ? ` of about ${r.data.recordCount}` : ""}
          {r.mode === "health-centers" && r.data.method === "zip" ? ` in ZIP code area (no distance available)` : ""}
        </p>
      </div>

      {sud ? sudPrompt : null}
      {part2 ? (
        <Notice tone="warn" title="42 CFR Part 2">
          <p>{part2}</p>
        </Notice>
      ) : null}
      <EndorsementNote />

      {r.mode === "providers" ? <p className="text-sm leading-relaxed text-muted">{r.data.notice}</p> : null}
      {r.mode === "health-centers" ? <p className="text-sm leading-relaxed text-muted">{r.data.slidingFeeNote}</p> : null}
      {r.mode === "treatment-facilities" ? (
        <p className="text-sm leading-relaxed text-muted">
          {r.data.notice} {r.data.helpline.label}:{" "}
          <a href={`tel:${r.data.helpline.number.replace(/[^\d]/g, "")}`} className="inline-flex min-h-11 items-center font-semibold text-accent underline underline-offset-2">
            {r.data.helpline.number}
          </a>
        </p>
      ) : null}

      {n === 0 ? (
        <Notice tone="neutral" title="No listings found">
          <p>Try a larger distance, a nearby ZIP code, or the official finder.</p>
          <FinderFallback finder={r.data.finder} className="mt-2 space-y-1.5" />
        </Notice>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {r.mode === "providers"
            ? r.data.results.map((p) => (
                <li key={p.npi}>
                  <ProviderCard p={p} />
                </li>
              ))
            : null}
          {r.mode === "health-centers"
            ? r.data.sites.map((s) => (
                <li key={s.id}>
                  <HealthCenterCard s={s} />
                </li>
              ))
            : null}
          {r.mode === "treatment-facilities"
            ? r.data.facilities.map((f, i) => (
                <li key={`${f.name}-${f.address.line}-${i}`}>
                  <FacilityCard f={f} />
                </li>
              ))
            : null}
        </ul>
      )}

      {outcome.moreError ? <ErrorPanel query={q} error={outcome.moreError} onRetry={() => onRetry(q, true)} /> : null}

      {more !== null && n > 0 ? (
        <Button type="button" variant="outline" disabled={outcome.loadingMore} onClick={() => onRetry(q, true)}>
          {outcome.loadingMore ? <Loader2 aria-hidden className="animate-spin" /> : null}
          {outcome.loadingMore ? "Loading…" : "Show more results"}
        </Button>
      ) : null}

      <div className="space-y-1 border-t border-border pt-3 text-xs leading-relaxed text-muted">
        <p>{r.attribution}</p>
        <p>
          <ExternalLink href={r.source} className="text-xs">
            About this data source
          </ExternalLink>
          {" · "}
          <ExternalLink href={r.data.finder.url} className="text-xs">
            {r.data.finder.label}
          </ExternalLink>
        </p>
      </div>
    </section>
  );
}
