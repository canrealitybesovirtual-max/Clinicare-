"use client";
/**
 * Live reference panels for one curated medication (clinician mode): the current FDA label via openFDA (boxed
 * warning first) and RxNorm names and classes via NLM RxNav. Only the curated medication id is sent, to our own
 * /api routes. Reference for referral conversations; never prescribing or dosing guidance.
 */
import * as React from "react";
import { FileText, Loader2, RefreshCw, ShieldAlert, Tags } from "lucide-react";
import type { DrugLabelResult } from "@/server/integrations/openfda";
import type { RxNormResult } from "@/server/integrations/rxnorm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ExternalLink } from "@/components/ui/external-link";
import { Notice } from "@/components/ui/notice";
import { NOT_FOR_PRESCRIBING } from "./medication-labels";
import { lookupErrorCopy, useLiveLookup, type LiveState } from "./use-live-lookup";
import { Disclosure } from "@/components/ui/disclosure";


function PanelShell({
  id,
  title,
  icon: Icon,
  busy,
  children,
}: {
  id: string;
  title: string;
  icon: typeof FileText;
  busy: boolean;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} aria-busy={busy || undefined} data-lookup-focus tabIndex={-1} className="rounded-xl">
      <Card className="space-y-4">
        <h2 id={id} className="flex items-center gap-2 text-lg font-semibold">
          <Icon aria-hidden className="size-5 text-accent" />
          {title}
        </h2>
        {children}
      </Card>
    </section>
  );
}

function Loading({ what }: { what: string }) {
  return (
    <div className="space-y-2">
      <p className="flex items-center gap-2 text-sm text-muted">
        <Loader2 aria-hidden className="size-4 animate-spin" />
        Loading {what}…
      </p>
      <div className="h-16 animate-pulse rounded-lg bg-surface-2" />
    </div>
  );
}

function LookupError({
  state,
  onRetry,
  children,
}: {
  state: Extract<LiveState<unknown>, { status: "error" }>;
  onRetry: () => void;
  children: React.ReactNode;
}) {
  const copy = lookupErrorCopy(state.code, state.message);
  return (
    <Notice tone={state.code === "not-configured" ? "info" : "warn"} title={copy.title}>
      <p>{copy.body}</p>
      {copy.retry ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-1"
          onClick={(e) => {
            // The button unmounts while the retry loads: keep focus on this panel instead of <body>.
            e.currentTarget.closest<HTMLElement>("[data-lookup-focus]")?.focus();
            onRetry();
          }}
        >
          <RefreshCw aria-hidden />
          Try again
        </Button>
      ) : null}
      <div className="mt-2 space-y-0.5 text-sm">{children}</div>
    </Notice>
  );
}

function Attribution({ attribution, source }: { attribution: string; source: string }) {
  return (
    <div className="space-y-1 border-t border-border pt-3 text-xs leading-relaxed text-muted">
      <p>{attribution}</p>
      <p>
        <ExternalLink href={source} className="text-xs">
          About this data source
        </ExternalLink>
      </p>
    </div>
  );
}

function StatusLine({ state, what }: { state: LiveState<unknown>; what: string }) {
  const text =
    state.status === "loading"
      ? `Loading ${what}.`
      : state.status === "ok"
        ? `${what.charAt(0).toUpperCase()}${what.slice(1)} loaded.`
        : `${lookupErrorCopy(state.code, state.message).title}.`;
  return (
    <p role="status" aria-live="polite" className="sr-only">
      {text}
    </p>
  );
}

const MATCH_LABELS: Record<NonNullable<DrugLabelResult["matchedBy"]>, string> = {
  "reference-brand": "Matched by the reference brand",
  "generic-name": "Matched by generic name",
  "product-data": "Matched by product data",
};

function LabelSection({ title, text }: { title: string; text: string | null }) {
  if (!text) return null;
  return (
    <Disclosure title={title} bordered={false} className="rounded-lg border border-border px-3" bodyClassName="pb-3">
      <p className="whitespace-pre-line">{text}</p>
    </Disclosure>
  );
}

/** openFDA label: boxed warning first, then indications, warnings and precautions, contraindications. */
export function DrugLabelPanel({ drug, name, dailyMedSearchUrl }: { drug: string; name: string; dailyMedSearchUrl: string }) {
  const { state, retry } = useLiveLookup<DrugLabelResult>("drug-label", drug);
  return (
    <PanelShell id="label-heading" title="Current FDA label (openFDA)" icon={FileText} busy={state.status === "loading"}>
      <StatusLine state={state} what="FDA label" />
      {state.status === "loading" ? <Loading what="the current FDA label" /> : null}
      {state.status === "error" ? (
        <LookupError state={state} onRetry={retry}>
          <ExternalLink href={state.fallbackUrl ?? dailyMedSearchUrl} className="inline-flex min-h-11 items-center">
            Search DailyMed for {name}
          </ExternalLink>
        </LookupError>
      ) : null}
      {state.status === "ok" ? <LabelBody result={state.data} name={name} /> : null}
      {state.status === "ok" ? <Attribution attribution={state.attribution} source={state.source} /> : null}
      <p className="text-sm font-semibold">{NOT_FOR_PRESCRIBING}</p>
    </PanelShell>
  );
}

function LabelBody({ result: r, name }: { result: DrugLabelResult; name: string }) {
  if (!r.found) {
    return (
      <Notice tone="neutral" title="No current label matched">
        <p>openFDA returned no suitable prescription label for {name}. Search DailyMed for the current labeling.</p>
        <p>
          <ExternalLink href={r.dailyMedUrl} className="inline-flex min-h-11 items-center">
            Search DailyMed
          </ExternalLink>
        </p>
      </Notice>
    );
  }
  return (
    <div className="space-y-4">
      {r.boxedWarning ? (
        // Warn tone (not crisis red): crisis red is kept for crisis buttons and active red flags.
        <div className="rounded-xl border-2 border-warn-border bg-warn-bg p-4">
          <h3 className="flex items-center gap-2 text-base font-bold text-warn-fg">
            <ShieldAlert aria-hidden className="size-5" />
            Boxed warning
          </h3>
          <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-text">{r.boxedWarning}</p>
        </div>
      ) : (
        <p className="rounded-lg bg-surface-2 p-3 text-sm">This label has no boxed warning section.</p>
      )}

      <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
        <dt className="font-semibold">Label effective date</dt>
        <dd>{r.effectiveTime ?? "Not stated"}</dd>
        {r.brandNames.length ? (
          <>
            <dt className="font-semibold">Label brand names</dt>
            <dd>{r.brandNames.join(", ")}</dd>
          </>
        ) : null}
        {r.routes.length ? (
          <>
            <dt className="font-semibold">Route</dt>
            <dd>{r.routes.map((x) => x.toLowerCase()).join(", ")}</dd>
          </>
        ) : null}
        {r.applicationNumber ? (
          <>
            <dt className="font-semibold">Application</dt>
            <dd className="font-mono text-xs leading-6">{r.applicationNumber}</dd>
          </>
        ) : null}
        {r.matchedBy ? (
          <>
            <dt className="font-semibold">Match</dt>
            <dd>{MATCH_LABELS[r.matchedBy]}</dd>
          </>
        ) : null}
      </dl>

      <div className="space-y-2">
        <LabelSection title="Indications and usage" text={r.indications} />
        <LabelSection title="Warnings and precautions" text={r.warningsAndCautions} />
        <LabelSection title="Contraindications" text={r.contraindications} />
      </div>
      {r.trimmed ? <p className="text-sm text-muted">Some sections are shortened here. Read the full label on DailyMed.</p> : null}
      <p>
        <ExternalLink href={r.dailyMedUrl} className="inline-flex min-h-11 items-center font-semibold">
          Full prescribing information on DailyMed
        </ExternalLink>
      </p>
    </div>
  );
}

const CLASS_TYPE_LABELS: Record<RxNormResult["classes"][number]["type"], string> = {
  ATC: "ATC",
  EPC: "FDA pharmacologic class",
  MOA: "Mechanism of action",
};

/** RxNorm: RxCUI, current brand names and drug classes. */
export function RxNormPanel({
  drug,
  name,
  curatedRxcui,
  rxNavUrl,
  dailyMedSearchUrl,
}: {
  drug: string;
  name: string;
  curatedRxcui: string;
  rxNavUrl: string | null;
  dailyMedSearchUrl: string;
}) {
  const { state, retry } = useLiveLookup<RxNormResult>("rxnorm", drug);
  return (
    <PanelShell id="rxnorm-heading" title="RxNorm names and classes" icon={Tags} busy={state.status === "loading"}>
      <StatusLine state={state} what="RxNorm data" />
      {state.status === "loading" ? <Loading what="RxNorm data" /> : null}
      {state.status === "error" ? (
        <LookupError state={state} onRetry={retry}>
          {rxNavUrl ? (
            <p>
              <ExternalLink href={state.fallbackUrl ?? rxNavUrl} className="inline-flex min-h-11 items-center">
                Open {name} in RxNav (RxCUI {curatedRxcui})
              </ExternalLink>
            </p>
          ) : null}
          <p>
            <ExternalLink href={dailyMedSearchUrl} className="inline-flex min-h-11 items-center">
              Search DailyMed
            </ExternalLink>
          </p>
        </LookupError>
      ) : null}
      {state.status === "ok" ? <RxNormBody result={state.data} name={name} /> : null}
      {state.status === "ok" ? <Attribution attribution={state.attribution} source={state.source} /> : null}
    </PanelShell>
  );
}

function RxNormBody({ result: r, name }: { result: RxNormResult; name: string }) {
  if (!r.found) {
    return (
      <Notice tone="neutral" title="Not found in RxNorm">
        <p>RxNorm returned no concept for {name} today. Use DailyMed instead.</p>
        <p>
          <ExternalLink href={r.links.dailyMedSearch} className="inline-flex min-h-11 items-center">
            Search DailyMed
          </ExternalLink>
        </p>
      </Notice>
    );
  }
  const single = r.brands.filter((b) => !b.combination);
  const combo = r.brands.filter((b) => b.combination);
  return (
    <div className="space-y-4">
      <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
        <dt className="font-semibold">RxNorm name</dt>
        <dd>{r.queryName}</dd>
        <dt className="font-semibold">RxCUI</dt>
        <dd className="font-mono text-xs leading-6">{r.rxcui}</dd>
        <dt className="font-semibold">Brand names</dt>
        <dd>{single.length ? single.map((b) => b.name).join(", ") : "None listed"}</dd>
        {combo.length ? (
          <>
            <dt className="font-semibold">In combination products</dt>
            <dd>{combo.map((b) => b.name).join(", ")}</dd>
          </>
        ) : null}
      </dl>
      {!r.matchesCurated ? (
        <Notice tone="warn" title="RxCUI differs from this app's curated record">
          <p>The live concept id does not match the one stored here, so this entry needs content review.</p>
        </Notice>
      ) : null}
      {r.classes.length ? (
        <div>
          <h3 className="text-sm font-semibold">Drug classes</h3>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {r.classes.map((c) => (
              <li key={`${c.type}-${c.id}`}>
                {/* One inline text run, so a long class name wraps as a sentence instead of as two flex columns. */}
                <Badge tone="neutral" className="rounded-lg">
                  <span>
                    <span className="text-muted">{CLASS_TYPE_LABELS[c.type]}:</span> {c.name}
                  </span>
                </Badge>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <ul className="space-y-0.5 text-sm">
        {r.links.rxnav ? (
          <li>
            <ExternalLink href={r.links.rxnav} className="inline-flex min-h-11 items-center">
              Open in RxNav
            </ExternalLink>
          </li>
        ) : null}
        <li>
          <ExternalLink href={r.links.dailyMedSearch} className="inline-flex min-h-11 items-center">
            Search DailyMed
          </ExternalLink>
        </li>
        {r.links.medlinePlus.map((m) => (
          <li key={m.url}>
            <ExternalLink href={m.url} className="inline-flex min-h-11 items-center">
              MedlinePlus: {m.title}
            </ExternalLink>
          </li>
        ))}
      </ul>
    </div>
  );
}
