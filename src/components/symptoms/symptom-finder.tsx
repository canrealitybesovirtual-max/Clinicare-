"use client";
import * as React from "react";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  ChevronDown,
  CircleMinus,
  FlaskConical,
  Search,
  ShieldAlert,
  Square,
  SquareCheck,
  Trash2,
  X,
} from "lucide-react";
import { getSymptom, lexicon } from "@/lib/content";
import { searchSymptoms } from "@/lib/matcher";
import type { Symptom } from "@/lib/schemas";
import { useSession } from "@/state/session";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChoiceGroup } from "@/components/ui/choice-group";
import { Notice } from "@/components/ui/notice";
import { cn } from "@/lib/utils";
import { useSymptomAnalysis, type SymptomAnalysis } from "./analysis";
import { RedFlagBanner } from "./red-flag-banner";
import { Under18Notice } from "./under18-notice";
import { useScrubbedField } from "./use-scrubbed-field";
import {
  AGE_CHOICES,
  CATEGORY_ORDER,
  DURATION_CHOICES,
  EXAMPLES,
  ONSET_CHOICES,
  TRI_CHOICES,
} from "./symptom-meta";

/* ------------------------------------------------------------------ shared bits */

function SymptomToggle({
  symptom,
  pressed,
  fromText,
  onToggle,
}: {
  symptom: Symptom;
  pressed: boolean;
  fromText?: boolean;
  onToggle: () => void;
}) {
  const Icon = pressed ? SquareCheck : Square;
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onToggle}
      className={cn(
        "flex min-h-11 w-full items-start gap-2.5 rounded-lg border px-3 py-2 text-left text-sm leading-snug transition-colors",
        pressed
          ? "border-primary bg-primary/10 text-text dark:bg-primary/15"
          : "border-border bg-surface text-text hover:bg-surface-2",
      )}
    >
      <Icon aria-hidden className={cn("mt-0.5 size-4 shrink-0", pressed ? "text-primary" : "text-muted")} />
      <span className="min-w-0 flex-1">
        {symptom.label}
        {fromText ? <span className="ml-1.5 whitespace-nowrap text-xs font-semibold text-accent">· in text</span> : null}
      </span>
      {symptom.redFlag ? (
        <ShieldAlert aria-label="Red flag" role="img" className="mt-0.5 size-4 shrink-0 text-crisis" />
      ) : null}
    </button>
  );
}

function SectionCard({
  id,
  title,
  description,
  children,
  className,
}: {
  id: string;
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section aria-labelledby={id} className={className}>
      <Card className="space-y-4">
        <div>
          <h2 id={id} className="text-lg font-semibold">
            {title}
          </h2>
          {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
        </div>
        {children}
      </Card>
    </section>
  );
}

function DiagnosesCta({ analysis, className, size = "lg" }: { analysis: SymptomAnalysis; className?: string; size?: "lg" | "md" }) {
  const n = analysis.result.suggestions.length;
  return (
    <Link href="/diagnoses" className={cn(buttonVariants({ variant: "primary", size }), "w-full", className)}>
      See possible diagnoses ({n})
      <ArrowRight aria-hidden />
    </Link>
  );
}

/* ------------------------------------------------------------------ free text */

function FreeTextCard({ analysis }: { analysis: SymptomAnalysis }) {
  const { state, set } = useSession();
  const field = useScrubbedField<HTMLTextAreaElement>(state.symptomText, (clean) => set({ symptomText: clean }));
  const hintId = React.useId();
  const detected = analysis.match.matches;

  return (
    <SectionCard
      id="describe-heading"
      title="Describe the presentation"
      description="Type what the client reports, in your words or theirs. Matching runs on this device only."
    >
      <div>
        <label htmlFor="symptom-text" className="text-sm font-semibold">
          Symptoms and behaviors (no names, dates, places or other identifiers)
        </label>
        <p id={hintId} className="mt-1 text-xs text-muted">
          Likely identifiers are removed automatically about half a second after you stop typing, but do not rely on
          that: leave them out.
        </p>
        <textarea
          id="symptom-text"
          ref={field.ref}
          aria-describedby={hintId}
          value={field.draft}
          onChange={(e) => field.setDraft(e.target.value)}
          onBlur={field.flushNow}
          rows={6}
          spellCheck
          autoComplete="off"
          placeholder="e.g., sudden panic out of nowhere, heart racing, now avoids crowds and buses"
          className="mt-2 block w-full resize-y rounded-lg border border-border bg-surface px-3 py-2.5 text-base leading-relaxed text-text placeholder:text-muted/80"
        />
      </div>

      <div role="alert">
        {field.removed ? (
          <Notice key={field.alertKey} tone="warn" title="Possible identifiers removed">
            <p>
              Removed and replaced with placeholders:{" "}
              {field.removed.map((r, i) => (
                <React.Fragment key={r.type}>
                  {i > 0 ? ", " : ""}
                  <strong>{r.label}</strong>
                  {r.count > 1 ? ` (${r.count})` : ""}
                </React.Fragment>
              ))}
              . Please do not enter identifying details.
            </p>
            <button
              type="button"
              onClick={field.dismissRemoved}
              className="inline-flex min-h-10 items-center gap-1 rounded-md text-sm font-semibold underline underline-offset-2"
            >
              Dismiss
            </button>
          </Notice>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1.5 text-sm font-semibold text-muted">
          <FlaskConical aria-hidden className="size-4" />
          Try an example:
        </span>
        {EXAMPLES.map((ex) => (
          <Button key={ex.id} type="button" variant="outline" size="sm" className="min-h-10" onClick={() => field.replace(ex.text)}>
            {ex.label}
          </Button>
        ))}
        {field.draft ? (
          <Button type="button" variant="ghost" size="sm" className="min-h-10" onClick={() => field.replace("")}>
            <Trash2 aria-hidden />
            Clear text
          </Button>
        ) : null}
      </div>

      <p aria-live="polite" className="sr-only">
        {detected.length} symptom{detected.length === 1 ? "" : "s"} detected from your text
        {analysis.absent.length ? `, ${analysis.absent.length} noted as absent` : ""}.
      </p>

      <div className="space-y-4 border-t border-border pt-4">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            Detected from your text <Badge tone="accent">{detected.length}</Badge>
          </h3>
          {detected.length ? (
            <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
              {detected.map((m) => {
                const s = getSymptom(m.symptomId);
                return (
                  <li key={m.symptomId} className="flex items-start gap-2 rounded-lg bg-accent-soft px-3 py-2 text-sm">
                    <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-accent" />
                    <span>
                      {s?.label ?? m.symptomId}
                      <span className="block text-xs text-muted">matched “{m.phrase}”</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-muted">
              Nothing detected yet. Everyday phrasings are recognized, such as “can’t leave the house” or “heart racing”.
            </p>
          )}
        </div>
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            Noted as absent <Badge tone="neutral">{analysis.absent.length}</Badge>
          </h3>
          {analysis.absent.length ? (
            <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
              {analysis.absent.map((m) => {
                const s = getSymptom(m.symptomId);
                return (
                  <li key={m.symptomId} className="flex items-start gap-2 rounded-lg bg-surface-2 px-3 py-2 text-sm">
                    <CircleMinus aria-hidden className="mt-0.5 size-4 shrink-0 text-muted" />
                    <span>
                      {s?.label ?? m.symptomId}
                      <span className="block text-xs text-muted">negated: “{m.phrase}”</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-muted">
              Denials such as “denies nightmares” or “no panic attacks” are listed here and not counted.
            </p>
          )}
        </div>
      </div>

      {!state.under18 ? <DiagnosesCta analysis={analysis} size="md" className="lg:hidden" /> : null}
    </SectionCard>
  );
}

/* ------------------------------------------------------------------ chip picker */

function SymptomPicker({ analysis }: { analysis: SymptomAnalysis }) {
  const { state, toggleSymptom } = useSession();
  const [query, setQuery] = React.useState("");
  const search = useScrubbedField<HTMLInputElement>(query, setQuery);
  const selected = new Set(state.selectedSymptomIds);
  const results = React.useMemo(() => searchSymptoms(query, lexicon.symptoms, 8), [query]);
  const grouped = React.useMemo(
    () =>
      CATEGORY_ORDER.map((c) => ({ ...c, items: lexicon.symptoms.filter((s) => s.category === c.id) })).filter(
        (g) => g.items.length > 0,
      ),
    [],
  );

  return (
    <SectionCard
      id="picker-heading"
      title="Add symptoms"
      description={`Search or browse the ${lexicon.symptoms.length} features in the Phase 1 lexicon. Tap to include or remove.`}
    >
      <div>
        <label htmlFor="symptom-search" className="text-sm font-semibold">
          Search symptoms
        </label>
        <div className="relative mt-2">
          <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input
            id="symptom-search"
            ref={search.ref}
            type="search"
            value={search.draft}
            onChange={(e) => search.setDraft(e.target.value)}
            onBlur={search.flushNow}
            autoComplete="off"
            placeholder="e.g., can't sleep, on edge"
            className="block min-h-11 w-full rounded-lg border border-border bg-surface pl-9 pr-3 text-base text-text placeholder:text-muted/80"
          />
        </div>
        <div role="alert">
          {search.removed ? (
            <p className="mt-2 text-sm font-medium text-warn-fg">
              Possible identifier removed from the search ({search.removed.map((r) => r.label).join(", ")}).
            </p>
          ) : null}
        </div>
        <p aria-live="polite" className="sr-only">
          {query ? `${results.length} matching symptom${results.length === 1 ? "" : "s"}` : ""}
        </p>
        {query ? (
          results.length ? (
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {results.map((s) => (
                <li key={s.id}>
                  <SymptomToggle
                    symptom={s}
                    pressed={selected.has(s.id)}
                    fromText={analysis.detectedIds.has(s.id)}
                    onToggle={() => toggleSymptom(s.id)}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-muted">No matching symptoms. Try other words, or browse the categories below.</p>
          )
        ) : null}
      </div>

      <div>
        <h3 className="text-sm font-semibold">Browse by category</h3>
        <div className="mt-2 divide-y divide-border overflow-hidden rounded-lg border border-border">
          {grouped.map((g) => {
            const count = g.items.filter((s) => selected.has(s.id)).length;
            return (
              <details key={g.id} className="group bg-surface">
                <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 px-3 py-2 text-sm font-semibold hover:bg-surface-2 [&::-webkit-details-marker]:hidden">
                  {g.id === "safety" ? <ShieldAlert aria-hidden className="size-4 text-crisis" /> : null}
                  <span className="flex-1">{g.label}</span>
                  {count ? <Badge tone="primary">{count} selected</Badge> : null}
                  <span className="text-xs font-normal text-muted">{g.items.length}</span>
                  <ChevronDown aria-hidden className="size-4 text-muted transition-transform group-open:rotate-180" />
                </summary>
                <ul className="grid gap-2 border-t border-border bg-bg/60 p-3 sm:grid-cols-2">
                  {g.items.map((s) => (
                    <li key={s.id}>
                      <SymptomToggle
                        symptom={s}
                        pressed={selected.has(s.id)}
                        fromText={analysis.detectedIds.has(s.id)}
                        onToggle={() => toggleSymptom(s.id)}
                      />
                    </li>
                  ))}
                </ul>
              </details>
            );
          })}
        </div>
      </div>
    </SectionCard>
  );
}

/* ------------------------------------------------------------------ summary + context */

function IncludedSummary({ analysis, className }: { analysis: SymptomAnalysis; className?: string }) {
  const { state, set, toggleSymptom } = useSession();
  const selected = new Set(state.selectedSymptomIds);
  return (
    <section aria-labelledby="included-heading" className={className}>
      <Card className="space-y-4">
        <h2 id="included-heading" className="flex items-center justify-between gap-2 text-lg font-semibold">
          Included for scoring
          <Badge tone="primary">{analysis.ids.length}</Badge>
        </h2>
        {analysis.ids.length ? (
          <ul className="max-h-80 space-y-1.5 overflow-y-auto pr-1" tabIndex={0} aria-label="Symptoms included for scoring">
            {analysis.ids.map((id) => {
              const s = getSymptom(id);
              const isSelected = selected.has(id);
              return (
                <li key={id} className="flex items-start gap-2 rounded-lg border border-border px-2.5 py-1.5 text-sm">
                  <span className="min-w-0 flex-1 py-1 leading-snug">
                    {s?.label ?? id}
                    <span className="mt-0.5 block text-xs text-muted">
                      {isSelected && analysis.detectedIds.has(id) ? "Selected · in text" : isSelected ? "Selected" : "From text"}
                    </span>
                  </span>
                  {isSelected ? (
                    <button
                      type="button"
                      onClick={() => toggleSymptom(id)}
                      className="inline-flex size-10 shrink-0 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-text"
                    >
                      <X aria-hidden className="size-4" />
                      <span className="sr-only">Remove {s?.label ?? id}</span>
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-muted">
            Nothing yet. Describe the presentation, try an example, or tap symptoms in the list.
          </p>
        )}
        {state.under18 ? (
          <p className="rounded-lg bg-warn-bg p-3 text-sm font-medium text-warn-fg">
            Adult content only: suggestions are not shown for clients under 18.
          </p>
        ) : (
          <DiagnosesCta analysis={analysis} />
        )}
        {state.selectedSymptomIds.length ? (
          <Button type="button" variant="ghost" size="sm" className="w-full" onClick={() => set({ selectedSymptomIds: [] })}>
            Clear selected symptoms
          </Button>
        ) : null}
      </Card>
    </section>
  );
}

function ContextCard() {
  const { state, set } = useSession();
  return (
    <section aria-labelledby="context-heading">
      <Card className="space-y-5">
        <div>
          <h2 id="context-heading" className="text-lg font-semibold">
            Context
          </h2>
          <p className="mt-1 text-sm text-muted">Duration and impairment act as gates; rule-outs lower the score and add a flag.</p>
        </div>
        <ChoiceGroup legend="Duration" name="duration" value={state.duration} options={DURATION_CHOICES} onChange={(v) => set({ duration: v })} />
        <ChoiceGroup
          legend="Onset"
          hint="For your reference; it does not change scores in Phase 1."
          name="onset"
          value={state.onset}
          options={ONSET_CHOICES}
          onChange={(v) => set({ onset: v })}
        />
        <ChoiceGroup
          legend="Clinically significant distress or functional impairment"
          name="impairment"
          value={state.impairment}
          options={TRI_CHOICES}
          onChange={(v) => set({ impairment: v })}
        />
        <ChoiceGroup
          legend="Substance or medication could explain the symptoms"
          hint="Kept in this tab only; never stored or sent (42 CFR Part 2)."
          name="substance"
          value={state.substancePossible}
          options={TRI_CHOICES}
          onChange={(v) => set({ substancePossible: v })}
        />
        <ChoiceGroup
          legend="A medical condition could explain the symptoms"
          name="medical"
          value={state.medicalPossible}
          options={TRI_CHOICES}
          onChange={(v) => set({ medicalPossible: v })}
        />
        <ChoiceGroup
          legend="Client is under 18"
          name="age"
          value={state.under18 ? "minor" : "adult"}
          options={AGE_CHOICES}
          onChange={(v) => set({ under18: v === "minor" })}
        />
        {state.under18 ? <Under18Notice /> : null}
      </Card>
    </section>
  );
}

/* ------------------------------------------------------------------ screen */

export function SymptomFinder() {
  const analysis = useSymptomAnalysis();
  const { state } = useSession();
  return (
    <>
      <RedFlagBanner flags={analysis.redFlags} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_23rem] lg:items-start">
        <div className="min-w-0 space-y-6">
          <FreeTextCard analysis={analysis} />
          <SymptomPicker analysis={analysis} />
          {!state.under18 ? <DiagnosesCta analysis={analysis} className="hidden lg:flex" /> : null}
        </div>
        <div className="flex min-w-0 flex-col gap-6">
          <IncludedSummary analysis={analysis} className="order-last lg:order-first" />
          <ContextCard />
        </div>
      </div>
    </>
  );
}
