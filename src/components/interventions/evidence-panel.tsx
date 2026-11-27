"use client";
import * as React from "react";
import { FlaskConical, LoaderCircle, RefreshCw, Search } from "lucide-react";
import { callApi, type ApiResult } from "@/lib/api-client";
import type { PubmedResult } from "@/server/integrations/pubmed";
import type { TrialsResult } from "@/server/integrations/clinicaltrials";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "@/components/ui/external-link";
import { Notice } from "@/components/ui/notice";

export interface PubmedTargetProps {
  queryId: string;
  label: string;
  kind: "intervention" | "condition";
  filterLabel: string;
  sud: boolean;
}

export interface TrialsTargetProps {
  conditionId: string;
  label: string;
  sud: boolean;
}

type Load<T> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ok"; data: T; attribution: string; source: string }
  | { status: "error"; code: string; fallbackUrl: string | null };

/** Link-outs are rendered only for the official sites the server is allowed to return. */
function safeUrl(url: unknown, origin: string): string | null {
  if (typeof url !== "string") return null;
  try {
    const u = new URL(url);
    return u.origin === origin ? u.toString() : null;
  } catch {
    return null;
  }
}

function errorText(code: string): string {
  switch (code) {
    case "network":
      return "You appear to be offline, or the service could not be reached.";
    case "rate-limited":
      return "Too many requests right now. Wait a few seconds, then try again.";
    case "not-configured":
      return "This lookup is not switched on for this site.";
    default:
      return "The service did not answer. Try again in a moment.";
  }
}

const RETRYABLE = new Set(["network", "rate-limited", "upstream"]);

/** One on-demand lookup. Sends only the curated id it is given (never typed text). */
function useLookup<T>(route: "pubmed" | "trials", body: Record<string, unknown>, origin: string) {
  const [state, setState] = React.useState<Load<T>>({ status: "idle" });
  const ctrl = React.useRef<AbortController | null>(null);
  const bodyJson = JSON.stringify(body);
  React.useEffect(() => () => ctrl.current?.abort(), []);

  const run = React.useCallback(async () => {
    ctrl.current?.abort();
    const ac = new AbortController();
    ctrl.current = ac;
    setState({ status: "loading" });
    const res: ApiResult<T> = await callApi<T>(route, JSON.parse(bodyJson) as Record<string, unknown>, ac.signal);
    if (ac.signal.aborted) return;
    if (res.ok) setState({ status: "ok", data: res.data, attribution: res.attribution, source: res.source });
    else setState({ status: "error", code: res.code, fallbackUrl: safeUrl((res as { fallbackUrl?: unknown }).fallbackUrl, origin) });
  }, [route, bodyJson, origin]);

  return { state, run };
}

function ErrorBox({ code, fallbackUrl, site, onRetry }: { code: string; fallbackUrl: string | null; site: string; onRetry: () => void }) {
  return (
    <Notice tone={code === "not-configured" ? "neutral" : "warn"} title={errorText(code)}>
      <div className="flex flex-wrap items-center gap-3">
        {RETRYABLE.has(code) ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={(e) => {
              // The button unmounts while the retry loads: keep focus on the section instead of <body>.
              e.currentTarget.closest<HTMLElement>("[data-lookup-focus]")?.focus();
              onRetry();
            }}
          >
            <RefreshCw aria-hidden />
            Try again
          </Button>
        ) : null}
        {fallbackUrl ? <ExternalLink href={fallbackUrl}>Open the same search on {site}</ExternalLink> : null}
      </div>
    </Notice>
  );
}

/** "Show …" and "Try again" unmount once clicked: move focus to the section first so it never drops to <body>. */
function focusSectionThen(e: React.MouseEvent<HTMLElement>, run: () => void) {
  e.currentTarget.closest<HTMLElement>("[data-lookup-focus]")?.focus();
  run();
}

/** One short polite status line per section, instead of a live region around the whole result list. */
function SectionStatus<T>({ state, done }: { state: Load<T>; done: (data: T) => string }) {
  const text =
    state.status === "loading"
      ? "Searching…"
      : state.status === "ok"
        ? done(state.data)
        : state.status === "error"
          ? errorText(state.code)
          : "";
  return (
    <p role="status" className="sr-only">
      {text}
    </p>
  );
}

/** The attribution string the server returned, shown verbatim, plus a link to the source site. */
function Attribution({ text, source, origin }: { text: string; source: string; origin: string }) {
  const href = safeUrl(source, origin);
  return (
    <p className="border-t border-border pt-3 text-xs leading-relaxed text-muted">
      {text}{" "}
      {href ? (
        <ExternalLink href={href} className="text-xs">
          {new URL(origin).hostname}
        </ExternalLink>
      ) : null}
    </p>
  );
}

const PUBMED_ORIGIN = "https://pubmed.ncbi.nlm.nih.gov";
const TRIALS_ORIGIN = "https://clinicaltrials.gov";

function PubmedSection({ target }: { target: PubmedTargetProps }) {
  const { state, run } = useLookup<PubmedResult>("pubmed", { queryId: target.queryId }, PUBMED_ORIGIN);
  const headingId = React.useId();
  return (
    <section aria-labelledby={headingId} data-lookup-focus tabIndex={-1} className="space-y-3 rounded-lg">
      <h3 id={headingId} className="flex items-center gap-2 text-base font-semibold">
        <Search aria-hidden className="size-4 text-muted" /> Reviews and trials in PubMed
      </h3>
      <p className="text-sm text-muted">
        Curated search: <span className="font-medium text-text">{target.label}</span>.{" "}
        {target.kind === "condition"
          ? "No intervention-specific search is curated yet, so this shows treatment evidence for a related condition. "
          : ""}
        {target.filterLabel}
      </p>
      {state.status === "idle" ? (
        <Button type="button" variant="outline" onClick={(e) => focusSectionThen(e, run)}>
          <Search aria-hidden />
          Show PubMed results
        </Button>
      ) : null}
      <SectionStatus state={state} done={(d: PubmedResult) => `${d.items.length} PubMed results listed.`} />
      <div aria-busy={state.status === "loading"} className="space-y-3">
        {state.status === "loading" ? (
          <p className="flex items-center gap-2 text-sm text-muted">
            <LoaderCircle aria-hidden className="size-4 animate-spin" /> Searching PubMed…
          </p>
        ) : null}
        {state.status === "error" ? <ErrorBox code={state.code} fallbackUrl={state.fallbackUrl} site="PubMed" onRetry={run} /> : null}
        {state.status === "ok" ? (
          <>
            <p className="text-sm">
              {state.data.items.length
                ? `${state.data.total.toLocaleString("en-US")} results; the ${state.data.items.length} best matches are listed.`
                : "No results for this search right now."}
            </p>
            {state.data.items.length ? (
              <ul className="space-y-3">
                {state.data.items.map((a) => {
                  const href = safeUrl(a.url, PUBMED_ORIGIN);
                  return (
                    <li key={a.pmid} className="rounded-lg border border-border p-3 text-sm">
                      {href ? <ExternalLink href={href}>{a.title}</ExternalLink> : <span className="font-medium">{a.title}</span>}
                      <p className="mt-1 text-xs text-muted">
                        {a.journal}
                        {a.year ? `, ${a.year}` : ""} · PMID {a.pmid}
                      </p>
                      {a.pubTypes.length ? (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {a.pubTypes.map((t) => (
                            <Badge key={t} tone="neutral">
                              {t}
                            </Badge>
                          ))}
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            ) : null}
            {safeUrl(state.data.searchUrl, PUBMED_ORIGIN) ? (
              <p className="text-sm">
                <ExternalLink href={safeUrl(state.data.searchUrl, PUBMED_ORIGIN)!}>See all results on PubMed</ExternalLink>
              </p>
            ) : null}
            <Attribution text={state.attribution} source={state.source} origin={PUBMED_ORIGIN} />
          </>
        ) : null}
      </div>
    </section>
  );
}

function TrialsSection({ target }: { target: TrialsTargetProps }) {
  const { state, run } = useLookup<TrialsResult>("trials", { condition: target.conditionId }, TRIALS_ORIGIN);
  const headingId = React.useId();
  return (
    <section aria-labelledby={headingId} data-lookup-focus tabIndex={-1} className="space-y-3 rounded-lg">
      <h3 id={headingId} className="flex items-center gap-2 text-base font-semibold">
        <FlaskConical aria-hidden className="size-4 text-muted" /> Recruiting trials
      </h3>
      <p className="text-sm text-muted">
        Adult studies now recruiting for <span className="font-medium text-text">{target.label}</span> on ClinicalTrials.gov.
        Listings are not endorsements; check eligibility and sites on the study page.
      </p>
      {state.status === "idle" ? (
        <Button type="button" variant="outline" onClick={(e) => focusSectionThen(e, run)}>
          <FlaskConical aria-hidden />
          Show recruiting trials
        </Button>
      ) : null}
      <SectionStatus state={state} done={(d: TrialsResult) => `${d.items.length} recruiting studies listed.`} />
      <div aria-busy={state.status === "loading"} className="space-y-3">
        {state.status === "loading" ? (
          <p className="flex items-center gap-2 text-sm text-muted">
            <LoaderCircle aria-hidden className="size-4 animate-spin" /> Searching ClinicalTrials.gov…
          </p>
        ) : null}
        {state.status === "error" ? (
          <ErrorBox code={state.code} fallbackUrl={state.fallbackUrl} site="ClinicalTrials.gov" onRetry={run} />
        ) : null}
        {state.status === "ok" ? (
          <>
            <p className="text-sm">
              {state.data.items.length
                ? `${state.data.total.toLocaleString("en-US")} recruiting studies; ${state.data.items.length} are listed.`
                : "No recruiting adult studies were found right now."}
            </p>
            {state.data.items.length ? (
              <ul className="space-y-3">
                {state.data.items.map((t) => {
                  const href = safeUrl(t.url, TRIALS_ORIGIN);
                  return (
                    <li key={t.nctId} className="rounded-lg border border-border p-3 text-sm">
                      {href ? <ExternalLink href={href}>{t.title}</ExternalLink> : <span className="font-medium">{t.title}</span>}
                      <p className="mt-1 text-xs text-muted">
                        {t.nctId} · {t.status}
                        {t.phase ? ` · ${t.phase}` : ""}
                        {t.studyType ? ` · ${t.studyType}` : ""}
                        {t.lastUpdated ? ` · updated ${t.lastUpdated}` : ""}
                      </p>
                      {t.interventions.length ? (
                        <p className="mt-1 text-xs">
                          <span className="font-semibold">Interventions:</span> {t.interventions.join("; ")}
                        </p>
                      ) : null}
                      {t.countries.length ? (
                        <p className="mt-1 text-xs text-muted">
                          {t.locationsCount} {t.locationsCount === 1 ? "site" : "sites"} · {t.countries.join(", ")}
                        </p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            ) : null}
            {safeUrl(state.data.searchUrl, TRIALS_ORIGIN) ? (
              <p className="text-sm">
                <ExternalLink href={safeUrl(state.data.searchUrl, TRIALS_ORIGIN)!}>See this search on ClinicalTrials.gov</ExternalLink>
              </p>
            ) : null}
            <Attribution text={state.attribution} source={state.source} origin={TRIALS_ORIGIN} />
          </>
        ) : null}
      </div>
    </section>
  );
}

/**
 * Evidence links for an intervention (clinician mode). Loads only when asked, sends only a curated search id or a
 * curated condition id to this app's own server (G5, G17), and always shows the source's attribution.
 */
export function EvidencePanel({ pubmed, trials }: { pubmed: PubmedTargetProps | null; trials: TrialsTargetProps | null }) {
  if (!pubmed && !trials) {
    return <p className="text-sm text-muted">No curated evidence search is available for this intervention yet.</p>;
  }
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted">
        Results load only when you ask. Only a curated search name is sent, never anything you typed. Links are for
        clinician review, not ratings of evidence; appraise each study.
      </p>
      {pubmed ? <PubmedSection target={pubmed} /> : null}
      {trials ? <TrialsSection target={trials} /> : null}
    </div>
  );
}
