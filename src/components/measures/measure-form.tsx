"use client";
import * as React from "react";
import { Eraser, ShieldAlert } from "lucide-react";
import type { Measure } from "@/lib/schemas";
import { licenses } from "@/lib/content";
import { emptyAnswers, scoreMeasure } from "@/lib/measures";
import { useSession } from "@/state/session";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ExternalLink } from "@/components/ui/external-link";
import { CrisisInline } from "@/components/crisis/crisis-panel";
import { DownloadPdfButton } from "@/components/pdf/download-pdf-button";
import { cn } from "@/lib/utils";

const CSSRS_URL = licenses.items["C-SSRS"]?.source ?? "https://cssrs.columbia.edu";

function OptionRow({
  name,
  options,
  value,
  onChange,
  showValues = true,
}: {
  name: string;
  options: { value: number; label: string }[];
  value: number | null;
  onChange: (v: number) => void;
  showValues?: boolean;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {options.map((o) => (
        <label
          key={o.value}
          className={cn(
            "flex min-h-12 cursor-pointer items-center gap-2.5 rounded-lg border border-border bg-surface px-3 py-2 text-sm leading-snug hover:bg-surface-2",
            "has-[:checked]:border-primary has-[:checked]:bg-primary/10 has-[:checked]:font-semibold dark:has-[:checked]:bg-primary/15",
          )}
        >
          <input
            type="radio"
            name={name}
            value={o.value}
            checked={value === o.value}
            onChange={() => onChange(o.value)}
            className="size-5 shrink-0 accent-primary"
          />
          <span className="min-w-0 flex-1">{o.label}</span>
          {showValues ? (
            <span aria-hidden className="text-xs font-semibold text-muted">
              {o.value}
            </span>
          ) : null}
        </label>
      ))}
    </div>
  );
}

function RiskPanel({ itemId, message }: { itemId: string; message: string }) {
  return (
    <div className="mt-3 rounded-xl border border-crisis/40 border-l-[6px] border-l-crisis bg-surface p-4">
      <p className="flex items-center gap-2 font-bold text-crisis">
        <ShieldAlert aria-hidden className="size-5" /> Follow up on item {itemId} now
      </p>
      <p className="mt-2 text-sm leading-relaxed">{message}</p>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
        <li>
          Ask directly about suicidal thoughts, intent, plans and means, for example with the{" "}
          <ExternalLink href={CSSRS_URL}>C-SSRS</ExternalLink> (external, license pending).
        </li>
        <li>Collaborate on a safety plan and follow your local protocol and supervision requirements.</li>
        <li>If there is immediate danger, contact emergency services.</li>
      </ul>
      <CrisisInline className="mt-2" />
      <p className="mt-1 text-xs text-muted">This flag is a prompt. The app does not assess or decide risk.</p>
    </div>
  );
}

/** Interactive measure (GAD-7 / PHQ-9). Answers live in memory-only session state; scores are never saved. */
export function MeasureForm({ measure }: { measure: Measure }) {
  const { state, answer, setFunctional, clearMeasure } = useSession();
  const answers = state.measureAnswers[measure.id] ?? emptyAnswers(measure);
  const functional = state.measureFunctional[measure.id] ?? null;
  const score = scoreMeasure(measure, answers);
  const n = measure.items.length;
  const flagged = new Map(score.riskFlags.map((r) => [r.itemId, r.message] as const));
  const liveText = `Total ${score.total} of ${measure.scoring.max}. ${score.answered} of ${n} items answered.${
    score.band ? ` Severity band: ${score.band.label}.` : ""
  }${score.riskFlags.length ? " Risk item flagged." : ""}`;

  const summary = (
    <Card className="space-y-3">
      <h2 className="text-lg font-semibold">Score</h2>
      <p aria-live="polite" aria-atomic="true" className="sr-only">
        {liveText}
      </p>
      <div className="flex items-end gap-3" aria-hidden>
        <p className="text-4xl font-bold tabular-nums tracking-tight text-primary dark:text-text">{score.total}</p>
        <p className="pb-1 text-sm text-muted">of {measure.scoring.max}</p>
        <p className="ml-auto pb-1 text-sm text-muted">
          {score.answered}/{n} answered
        </p>
      </div>
      <div aria-hidden className="h-2 overflow-hidden rounded-full bg-border/70">
        <div className="h-full rounded-full bg-accent" style={{ width: `${(score.answered / n) * 100}%` }} />
      </div>
      {score.band ? (
        <div className="rounded-lg bg-accent-soft p-3 text-sm">
          <p className="font-semibold">Severity band: {score.band.label}</p>
          <p className="mt-1 leading-relaxed">{score.band.clinicianNote}</p>
        </div>
      ) : (
        <p className="rounded-lg bg-surface-2 p-3 text-sm text-muted">
          Answer all {n} items to see the severity band. The running total counts answered items only.
        </p>
      )}
      {score.riskFlags.length ? (
        <p className="flex items-start gap-2 rounded-lg border border-crisis/40 p-3 text-sm font-semibold text-crisis">
          <ShieldAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          Item {score.riskFlags.map((r) => r.itemId).join(", ")} flagged: follow up directly (see the item).
        </p>
      ) : null}
      <details className="text-sm">
        <summary className="min-h-10 cursor-pointer py-2 font-semibold">Scoring bands</summary>
        <ul className="space-y-1 text-muted">
          {measure.scoring.bands.map((b) => (
            <li key={b.label} className="flex justify-between gap-2">
              <span>{b.label}</span>
              <span className="tabular-nums">
                {b.min}–{b.max}
              </span>
            </li>
          ))}
        </ul>
      </details>
      <p className="text-xs font-semibold text-text">Scores are not saved — record the result in your EHR.</p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={() => clearMeasure(measure.id)} disabled={score.answered === 0 && functional === null}>
          <Eraser aria-hidden />
          Clear answers
        </Button>
        <DownloadPdfButton measure={measure} label="Download blank PDF" />
      </div>
    </Card>
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
      <div className="min-w-0">
        <div className="sticky top-0 z-10 -mx-4 mb-4 border-b border-border bg-bg/95 px-4 py-2 text-sm backdrop-blur lg:hidden" aria-hidden>
          <span className="font-semibold">Total {score.total}</span>
          <span className="text-muted"> of {measure.scoring.max} · {score.answered}/{n} answered</span>
          {score.band ? <span className="text-muted"> · {score.band.label}</span> : null}
        </div>

        <form onSubmit={(e) => e.preventDefault()} aria-labelledby="measure-instructions">
          <p id="measure-instructions" className="mb-4 rounded-xl bg-info-bg p-4 text-base font-medium leading-relaxed text-info-fg">
            {measure.instructions}
          </p>
          <ol className="space-y-4">
            {measure.items.map((item, i) => (
              <li key={item.id}>
                <fieldset className="rounded-xl border border-border bg-surface p-4">
                  <legend className="sr-only">
                    Item {i + 1} of {n}: {item.text}
                  </legend>
                  <p aria-hidden className="mb-3 flex gap-3 text-base font-medium leading-snug">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-2 text-sm font-bold">
                      {i + 1}
                    </span>
                    <span>{item.text}</span>
                  </p>
                  <OptionRow
                    name={`${measure.id}-item-${item.id}`}
                    options={measure.options}
                    value={answers[i] ?? null}
                    onChange={(v) => answer(measure.id, i, v, n)}
                  />
                </fieldset>
                <div role="alert">{flagged.has(item.id) ? <RiskPanel itemId={item.id} message={flagged.get(item.id) ?? ""} /> : null}</div>
              </li>
            ))}
          </ol>

          {measure.functionalItem ? (
            <fieldset className="mt-4 rounded-xl border border-dashed border-border bg-surface p-4">
              <legend className="sr-only">Functional difficulty (not scored): {measure.functionalItem.text}</legend>
              <p aria-hidden className="mb-1 text-base font-medium leading-snug">
                {measure.functionalItem.text}
              </p>
              <p className="mb-3 text-xs text-muted">Not part of the total score.</p>
              <OptionRow
                name={`${measure.id}-functional`}
                options={measure.functionalItem.options.map((label, value) => ({ value, label }))}
                value={functional}
                onChange={(v) => setFunctional(measure.id, v)}
                showValues={false}
              />
            </fieldset>
          ) : null}
        </form>
      </div>

      <div className="lg:sticky lg:top-4">{summary}</div>
    </div>
  );
}
