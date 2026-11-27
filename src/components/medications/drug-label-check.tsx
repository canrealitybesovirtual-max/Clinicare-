"use client";
/**
 * Mental-health label check (clinician mode): pick a curated medicine, load its current FDA label through our own
 * /api/drug-label route (only the curated id is sent), and see the boxed-warning and warnings sentences that mention
 * mood, behavior, sleep or thinking. Education for a conversation with the prescriber; never prescribing advice,
 * never a finding about a client.
 */
import * as React from "react";
import Link from "next/link";
import { ArrowRight, FileSearch, Loader2, RefreshCw, ShieldAlert } from "lucide-react";
import type { DrugLabelResult } from "@/server/integrations/openfda";
import type { PsychEffect } from "@/lib/schemas-care";
import { PART2_NOTICE } from "@/lib/referral-links";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ExternalLink } from "@/components/ui/external-link";
import { Notice } from "@/components/ui/notice";
import { labelMentions, type LabelMention } from "./label-mentions";
import { NOT_FOR_PRESCRIBING } from "./medication-labels";
import { lookupErrorCopy, useLiveLookup } from "./use-live-lookup";

export interface CheckableMedicine {
  id: string;
  name: string;
  /** Substance use treatment uses: show the Part 2 notice (G6). */
  sud: boolean;
}

export function DrugLabelCheck({
  medicines,
  effectLabels,
  initialId,
}: {
  medicines: readonly CheckableMedicine[];
  effectLabels: Readonly<Record<PsychEffect, string>>;
  initialId?: string;
}) {
  const [choice, setChoice] = React.useState(initialId ?? medicines[0]?.id ?? "");
  const [checked, setChecked] = React.useState<string | null>(null);
  const med = medicines.find((m) => m.id === checked);

  return (
    <section aria-labelledby="label-check-heading">
      <Card className="space-y-4">
        <h2 id="label-check-heading" className="flex items-center gap-2 text-lg font-semibold">
          <FileSearch aria-hidden className="size-5 text-accent" />
          Check a current label for mental health effects
        </h2>
        <p className="text-sm text-muted">
          For medicines in the app&apos;s reference list. Only the medicine&apos;s curated name is sent; the label comes from
          openFDA.
        </p>
        <form
          className="flex flex-col gap-2 sm:flex-row sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            setChecked(choice);
          }}
        >
          <div className="min-w-0 flex-1 space-y-1.5">
            <label htmlFor="label-check-medicine" className="block text-sm font-semibold">
              Medicine
            </label>
            <select
              id="label-check-medicine"
              value={choice}
              onChange={(e) => setChoice(e.target.value)}
              className="block min-h-11 w-full rounded-xl border border-input-border bg-surface px-3 text-base text-text"
            >
              {medicines.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" disabled={!choice}>
            Check label
          </Button>
        </form>
        {med ? <LabelCheckResult key={med.id} med={med} effectLabels={effectLabels} /> : null}
        <p className="text-sm font-semibold">{NOT_FOR_PRESCRIBING}</p>
      </Card>
    </section>
  );
}

function Mentions({ title, items, effectLabels }: { title: string; items: LabelMention[]; effectLabels: Readonly<Record<PsychEffect, string>> }) {
  if (!items.length) return null;
  return (
    <div className="space-y-2">
      <h3 className="text-base font-semibold">{title}</h3>
      <ul className="space-y-2">
        {items.map((m) => (
          <li key={m.sentence} className="rounded-lg bg-surface-2 p-3 text-sm leading-relaxed">
            <p>{m.sentence}</p>
            <p className="mt-2 flex flex-wrap gap-1.5">
              {m.effects.map((e) => (
                <Badge key={e} tone="neutral">
                  {effectLabels[e]}
                </Badge>
              ))}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function LabelCheckResult({ med, effectLabels }: { med: CheckableMedicine; effectLabels: Readonly<Record<PsychEffect, string>> }) {
  const { state, retry } = useLiveLookup<DrugLabelResult>("drug-label", med.id);
  return (
    <div aria-busy={state.status === "loading" || undefined} className="space-y-4 border-t border-border pt-4">
      <p role="status" aria-live="polite" className="sr-only">
        {state.status === "loading" ? `Loading the label for ${med.name}.` : state.status === "ok" ? `Label for ${med.name} loaded.` : "The label could not be loaded."}
      </p>
      {med.sud ? (
        <Notice tone="warn" title="42 CFR Part 2">
          <p>This medicine has substance use treatment uses. Nothing is stored or sent about the client. {PART2_NOTICE}</p>
        </Notice>
      ) : null}
      {state.status === "loading" ? (
        <p className="flex items-center gap-2 text-sm text-muted">
          <Loader2 aria-hidden className="size-4 animate-spin" />
          Loading the current label for {med.name}…
        </p>
      ) : null}
      {state.status === "error" ? (
        <Notice tone={state.code === "not-configured" ? "info" : "warn"} title={lookupErrorCopy(state.code, state.message).title}>
          <p>{lookupErrorCopy(state.code, state.message).body}</p>
          {lookupErrorCopy(state.code, state.message).retry ? (
            <Button type="button" variant="outline" size="sm" className="mt-1" onClick={retry}>
              <RefreshCw aria-hidden />
              Try again
            </Button>
          ) : null}
          {state.fallbackUrl ? (
            <p>
              <ExternalLink href={state.fallbackUrl} className="inline-flex min-h-11 items-center">
                Search DailyMed for {med.name}
              </ExternalLink>
            </p>
          ) : null}
        </Notice>
      ) : null}
      {state.status === "ok" ? <LabelCheckBody result={state.data} med={med} effectLabels={effectLabels} attribution={state.attribution} /> : null}
    </div>
  );
}

function LabelCheckBody({
  result: r,
  med,
  effectLabels,
  attribution,
}: {
  result: DrugLabelResult;
  med: CheckableMedicine;
  effectLabels: Readonly<Record<PsychEffect, string>>;
  attribution: string;
}) {
  const boxed = labelMentions(r.boxedWarning);
  const warnings = labelMentions(r.warningsAndCautions);
  return (
    <div className="space-y-4">
      {!r.found ? (
        <p className="text-sm">No current prescription label matched {med.name}. Search DailyMed for the labeling.</p>
      ) : boxed.length || warnings.length ? (
        <>
          {boxed.length ? (
            <p className="flex items-center gap-2 text-sm font-semibold text-warn-fg">
              <ShieldAlert aria-hidden className="size-4" />
              The boxed warning mentions mental health effects.
            </p>
          ) : null}
          <Mentions title="Boxed warning" items={boxed} effectLabels={effectLabels} />
          <Mentions title="Warnings and precautions" items={warnings} effectLabels={effectLabels} />
        </>
      ) : (
        <p className="rounded-lg bg-surface-2 p-3 text-sm">
          The boxed warning and warnings sections returned here do not mention mood, behavior, sleep or thinking. Other
          parts of the full label, such as adverse reactions, may still list them.
        </p>
      )}
      {r.trimmed ? <p className="text-sm text-muted">Sections are shortened here. Read the full label.</p> : null}
      <div className="flex flex-wrap gap-x-4">
        <ExternalLink href={r.dailyMedUrl} className="inline-flex min-h-11 items-center font-semibold">
          Full label on DailyMed
        </ExternalLink>
        <Link
          href={`/medications/${encodeURIComponent(med.id)}`}
          className="inline-flex min-h-11 items-center gap-1.5 font-semibold text-accent underline underline-offset-2"
        >
          {med.name} in the reference
          <ArrowRight aria-hidden className="size-4" />
        </Link>
      </div>
      <p className="text-xs text-muted">{attribution}</p>
    </div>
  );
}
