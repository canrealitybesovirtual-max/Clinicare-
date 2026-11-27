"use client";
/**
 * Symptom Finder (spec screen 1), as guided steps: 1 describe, 2 check what was found, 3 help me ask more,
 * 4 context, 5 add or remove symptoms. The text box comes first so it is on screen right away on a phone.
 * Everything runs on this device and lives in memory-only session state (G5).
 */
import * as React from "react";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  ChevronDown,
  CircleMinus,
  FlaskConical,
  History,
  MessageCircleQuestion,
  Search,
  ShieldAlert,
  Square,
  SquareCheck,
  Trash2,
  X,
} from "lucide-react";
import { getSymptom, lexicon } from "@/lib/content";
import type { ResourceCatalog } from "@/lib/follow-up";
import { searchSymptoms } from "@/lib/matcher";
import type { Symptom } from "@/lib/schemas";
import { useSession } from "@/state/session";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChoiceGroup } from "@/components/ui/choice-group";
import { Notice } from "@/components/ui/notice";
import { ExternalLink } from "@/components/ui/external-link";
import { PRIVATE_TEXT_FIELD_PROPS } from "@/components/ui/private-field";
import { HubPrompt } from "@/components/hub/hub-prompt";
import { AssistantPanel, type AssistantStatus } from "@/components/ai/assistant-panel";
import { FollowUpPanel } from "@/components/ai/follow-up-panel";
import { OnDeviceSuggestions } from "@/components/ai/on-device-suggestions";
import { cn } from "@/lib/utils";
import { useSymptomAnalysis, type SymptomAnalysis } from "./analysis";
import { RedFlagBanner, RiskMissNote } from "./red-flag-banner";
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

/** APA online assessment measures page, which hosts the Cultural Formulation Interview (link-out only). */
const CFI_URL = "https://www.psychiatry.org/psychiatrists/practice/dsm/educational-resources/assessment-measures";

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

/** One guided step: a numbered heading, an optional one-line hint (hidden on phones when `hintOnPhones` is false). */
function Step({
  n,
  id,
  title,
  hint,
  hintOnPhones = true,
  optional = false,
  children,
}: {
  n: number;
  id: string;
  title: string;
  hint?: React.ReactNode;
  hintOnPhones?: boolean;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id}>
      <Card className="space-y-4 p-4 sm:p-6">
        <div className="flex items-start gap-3">
          <span
            aria-hidden
            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-sm font-bold text-accent"
          >
            {n}
          </span>
          <div className="min-w-0 pt-0.5">
            <h2 id={id} className="text-lg font-semibold leading-snug">
              <span className="sr-only">Step {n}: </span>
              {title}
              {optional ? <span className="ml-2 text-sm font-normal text-muted">optional</span> : null}
            </h2>
            {hint ? <p className={cn("mt-0.5 text-sm text-muted", !hintOnPhones && "hidden sm:block")}>{hint}</p> : null}
          </div>
        </div>
        {children}
      </Card>
    </section>
  );
}

function DiagnosesCta({ analysis, className, size = "lg" }: { analysis: SymptomAnalysis; className?: string; size?: "lg" | "md" }) {
  const n = analysis.result.suggestions.length;
  // With nothing to score yet, a quiet outline link (no "(0)") rather than a full primary button.
  return (
    <Link
      href="/diagnoses"
      className={cn(buttonVariants({ variant: n === 0 ? "outline" : "primary", size }), "w-full", className)}
    >
      {n === 0 ? "See possible diagnoses" : `See possible diagnoses (${n})`}
      <ArrowRight aria-hidden />
    </Link>
  );
}

/** "3 found in your text · 4 included for scoring", one line, without the full list. */
function countsLine(analysis: SymptomAnalysis): string {
  const found = analysis.match.matches.length;
  const included = analysis.ids.length;
  return `${found} found in your text · ${included} included for scoring`;
}

/**
 * Phones and tablets: the running result right under the text box, so the first screen shows whether anything
 * matched and leads straight to the suggestions (wide screens have the sticky "Included for scoring" column).
 * Not a live region: step 2 announces the same counts.
 */
function QuickSummary({ analysis }: { analysis: SymptomAnalysis }) {
  const { state } = useSession();
  if (!state.symptomText.trim() && analysis.ids.length === 0) return null;
  return (
    <div className="flex flex-col gap-2 rounded-lg bg-surface-2 p-3 sm:flex-row sm:items-center sm:justify-between lg:hidden">
      <p className="text-sm font-semibold">{countsLine(analysis)}</p>
      {state.under18 ? null : <DiagnosesCta analysis={analysis} size="md" className="sm:w-auto" />}
    </div>
  );
}

/* ------------------------------------------------------------------ step 1: describe */

function DescribeStep({ analysis }: { analysis: SymptomAnalysis }) {
  const { state, set } = useSession();
  const field = useScrubbedField<HTMLTextAreaElement>(state.symptomText, (clean) => set({ symptomText: clean }));
  const hintId = React.useId();

  return (
    <Step
      n={1}
      id="describe-heading"
      title="Describe the presentation"
      hint="In your words or theirs. Matching runs on this device."
      hintOnPhones={false}
    >
      <div>
        <label htmlFor="symptom-text" className="text-sm font-semibold">
          Symptoms and behaviors <span className="font-normal text-muted">(no names, dates or places)</span>
        </label>
        <textarea
          id="symptom-text"
          ref={field.ref}
          aria-describedby={hintId}
          value={field.draft}
          onChange={(e) => field.setDraft(e.target.value)}
          onBlur={field.onBlur}
          rows={5}
          {...PRIVATE_TEXT_FIELD_PROPS}
          placeholder="e.g., panic from dogs; heart racing; now avoids the park"
          className="mt-2 block w-full resize-y rounded-lg border border-input-border bg-surface px-3 py-2.5 text-base leading-relaxed text-text placeholder:text-muted"
        />
        <p id={hintId} className="mt-1.5 text-xs text-muted">
          Anything that looks like an identifier is removed as you type, but please leave identifiers out.
        </p>
      </div>

      <QuickSummary analysis={analysis} />

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
              onClick={() => {
                field.dismissRemoved();
                // The button disappears: put focus back in the text box instead of dropping it to <body>.
                field.ref.current?.focus();
              }}
              className="inline-flex min-h-11 items-center gap-1 rounded-md text-sm font-semibold underline underline-offset-2"
            >
              Dismiss
            </button>
          </Notice>
        ) : null}
      </div>

      {/* Below the field, so a new banner never pushes the text box (and the caret) off-screen while typing. */}
      <RedFlagBanner flags={analysis.redFlags} className="" />
      <RiskMissNote className="mb-0" />

      <div className="flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1.5 text-sm font-semibold text-muted">
          <FlaskConical aria-hidden className="size-4" />
          Try an example:
        </span>
        {EXAMPLES.map((ex) => (
          <Button key={ex.id} type="button" variant="outline" size="sm" onClick={() => field.replace(ex.text)}>
            {ex.label}
          </Button>
        ))}
        {field.draft ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              field.replace("");
              field.ref.current?.focus();
            }}
          >
            <Trash2 aria-hidden />
            Clear text
          </Button>
        ) : null}
      </div>
    </Step>
  );
}

/* ------------------------------------------------------------------ step 2: what was found */

function FoundStep({ analysis }: { analysis: SymptomAnalysis }) {
  const detected = analysis.match.matches;
  const setAside = new Set(analysis.setAsideByAnswers);
  return (
    <Step n={2} id="found-heading" title="Check what was found" hint="Tap symptoms in step 5 to add anything that was missed.">
      <p aria-live="polite" className="sr-only">
        {detected.length} symptom{detected.length === 1 ? "" : "s"} detected from your text
        {analysis.absent.length ? `, ${analysis.absent.length} noted as absent` : ""}.
      </p>
      <div>
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          Detected from your text <Badge tone="accent">{detected.length}</Badge>
        </h3>
        {detected.length ? (
          <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
            {detected.map((m) => {
              const s = getSymptom(m.symptomId);
              const aside = setAside.has(m.symptomId);
              return (
                <li
                  key={m.symptomId}
                  className={cn("flex items-start gap-2 rounded-lg px-3 py-2 text-sm", aside ? "bg-surface-2" : "bg-accent-soft")}
                >
                  <Check aria-hidden className={cn("mt-0.5 size-4 shrink-0", aside ? "text-muted" : "text-accent")} />
                  <span className="min-w-0 flex-1">
                    {s?.label ?? m.symptomId}
                    <span className="block text-xs text-muted">
                      matched “{m.phrase}”{aside ? " · set aside by your answer" : ""}
                    </span>
                  </span>
                  {s?.redFlag ? (
                    <ShieldAlert aria-label="Red flag" role="img" className="mt-0.5 size-4 shrink-0 text-crisis" />
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : analysis.ids.length ? (
          <p className="mt-2 text-sm text-muted">
            Nothing found in the text.{" "}
            {analysis.ids.length} {analysis.ids.length === 1 ? "feature" : "features"} added from your answers or taps
            {" "}(listed under Included for scoring).
          </p>
        ) : (
          <p className="mt-2 text-sm text-muted">
            Nothing detected yet. Everyday phrasings are recognized, such as “can’t leave the house” or “heart racing”.
          </p>
        )}
      </div>
      {analysis.absent.length ? (
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            Noted as absent <Badge tone="neutral">{analysis.absent.length}</Badge>
          </h3>
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
        </div>
      ) : (
        <p className="text-xs text-muted">Denials such as “denies nightmares” are noted as absent and not counted.</p>
      )}
      {analysis.attributed.length ? (
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            Family or past history (not scored) <Badge tone="neutral">{analysis.attributed.length}</Badge>
          </h3>
          <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
            {analysis.attributed.map((m) => {
              const s = getSymptom(m.symptomId);
              return (
                <li key={m.symptomId} className="flex items-start gap-2 rounded-lg bg-surface-2 px-3 py-2 text-sm">
                  <History aria-hidden className="mt-0.5 size-4 shrink-0 text-muted" />
                  <span>
                    {s?.label ?? m.symptomId}
                    <span className="block text-xs text-muted">
                      {m.reason === "family" ? "about a relative" : "resolved or past"}: “{m.phrase}”
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-xs text-muted">
            Mentions about relatives or resolved past history are not counted. Add a chip if it applies to the client now.
          </p>
        </div>
      ) : null}
      {analysis.cultural.length ? (
        <Notice tone="info" title="Cultural concept of distress named">
          <p>
            The text names an idiom of distress (for example “ataque de nervios”, “nervios” or “thinking too much”). It is
            not mapped to any condition. Ask what it means to the client, and consider the{" "}
            <ExternalLink href={CFI_URL}>Cultural Formulation Interview</ExternalLink> (APA, external). Each condition’s
            cultural notes are on the Diagnoses screen.
          </p>
        </Notice>
      ) : null}

      <OnDeviceSuggestions analysis={analysis} />
    </Step>
  );
}

/* ------------------------------------------------------------------ step 3: help me ask more */

function AskMoreStep({
  analysis,
  catalog,
  assistant,
}: {
  analysis: SymptomAnalysis;
  catalog: ResourceCatalog;
  assistant: AssistantStatus;
}) {
  const { state } = useSession();
  const empty = analysis.ids.length === 0 && analysis.triggers.length === 0;
  if (state.under18) return null; // adult-only content (G12); the notice in step 4 says so
  if (empty) {
    return (
      <Step n={3} id="askmore-heading" title="Help me ask more">
        <p className="flex items-start gap-2 text-sm text-muted">
          <MessageCircleQuestion aria-hidden className="mt-0.5 size-4 shrink-0" />
          Once you describe the presentation, follow-up questions to consider asking appear here, with answers you can tap.
        </p>
      </Step>
    );
  }
  return (
    <FollowUpPanel analysis={analysis} catalog={catalog} step={3}>
      <AssistantPanel status={assistant} analysis={analysis} />
    </FollowUpPanel>
  );
}

/* ------------------------------------------------------------------ step 4: context */

function ContextStep() {
  const { state, set } = useSession();
  return (
    <Step
      n={4}
      id="context-heading"
      title="Add context"
      hint="These change how patterns are scored. Leave “Not recorded” until you have asked."
    >
      <div className="space-y-5">
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
      </div>
    </Step>
  );
}

/* ------------------------------------------------------------------ step 5: chip picker */

function PickerStep({ analysis }: { analysis: SymptomAnalysis }) {
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
    <Step
      n={5}
      id="picker-heading"
      title="Add or remove symptoms"
      optional
      hint={`Search or browse the ${lexicon.symptoms.length} features in the lexicon. Tap to include or remove.`}
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
            onBlur={search.onBlur}
            {...PRIVATE_TEXT_FIELD_PROPS}
            placeholder="e.g., can't sleep, on edge"
            className="block min-h-11 w-full rounded-lg border border-input-border bg-surface pl-9 pr-3 text-base text-text placeholder:text-muted"
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
                  <ChevronDown aria-hidden className="size-4 text-muted transition-transform motion-reduce:transition-none group-open:rotate-180" />
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
    </Step>
  );
}

/* ------------------------------------------------------------------ running summary */

function sourceOf(id: string, analysis: SymptomAnalysis, selected: ReadonlySet<string>): string {
  if (selected.has(id)) return analysis.detectedIds.has(id) ? "Selected · in text" : "Selected";
  return analysis.fromAnswers.has(id) ? "From your answers" : "From text";
}

function IncludedSummary({ analysis, className }: { analysis: SymptomAnalysis; className?: string }) {
  const { state, set, toggleSymptom } = useSession();
  const selected = new Set(state.selectedSymptomIds);
  const listRef = React.useRef<HTMLUListElement>(null);
  const headingRef = React.useRef<HTMLHeadingElement>(null);
  // Where focus goes after a Remove button disappears: the next remove button, else the list, else the heading.
  const focusAfterRemove = React.useRef<number | null>(null);
  React.useEffect(() => {
    const index = focusAfterRemove.current;
    if (index === null) return;
    focusAfterRemove.current = null;
    const buttons = listRef.current?.querySelectorAll<HTMLButtonElement>("button[data-remove]");
    const next = buttons?.[Math.min(index, buttons.length - 1)];
    (next ?? listRef.current ?? headingRef.current)?.focus();
  });
  return (
    <section aria-labelledby="included-heading" className={className}>
      <Card className="space-y-4 p-4 sm:p-5">
        <h2
          id="included-heading"
          ref={headingRef}
          tabIndex={-1}
          className="flex items-center justify-between gap-2 text-lg font-semibold outline-none focus-visible:outline-3"
        >
          Included for scoring
          <Badge tone="primary">{analysis.ids.length}</Badge>
        </h2>
        {analysis.ids.length ? (
          <ul
            ref={listRef}
            className="max-h-80 space-y-1.5 overflow-y-auto pr-1"
            tabIndex={0}
            aria-label="Symptoms included for scoring"
          >
            {analysis.ids.map((id) => {
              const s = getSymptom(id);
              const isSelected = selected.has(id);
              return (
                <li key={id} className="flex items-start gap-2 rounded-lg border border-border px-2.5 py-1.5 text-sm">
                  <span className="min-w-0 flex-1 py-1 leading-snug">
                    {s?.label ?? id}
                    <span className="mt-0.5 block text-xs text-muted">{sourceOf(id, analysis, selected)}</span>
                  </span>
                  {isSelected ? (
                    <button
                      type="button"
                      data-remove
                      onClick={(e) => {
                        const all = listRef.current?.querySelectorAll("button[data-remove]");
                        focusAfterRemove.current = all ? Array.prototype.indexOf.call(all, e.currentTarget) : 0;
                        toggleSymptom(id);
                      }}
                      className="inline-flex size-11 shrink-0 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-text"
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
          <p className="text-sm text-muted">Nothing yet. Describe the presentation, try an example, or tap symptoms.</p>
        )}
        {state.under18 ? (
          <p className="rounded-lg bg-warn-bg p-3 text-sm font-medium text-warn-fg">
            Adult content only: suggestions are not shown for clients under 18.
          </p>
        ) : (
          <DiagnosesCta analysis={analysis} />
        )}
        {state.selectedSymptomIds.length ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full"
            onClick={() => {
              set({ selectedSymptomIds: [] });
              document.getElementById("symptom-search")?.focus();
            }}
          >
            Clear selected symptoms
          </Button>
        ) : null}
      </Card>
    </section>
  );
}

/* ------------------------------------------------------------------ screen */

export function SymptomFinder({ catalog, assistant }: { catalog: ResourceCatalog; assistant: AssistantStatus }) {
  const analysis = useSymptomAnalysis();
  const { resetCount } = useSession();
  return (
    <>
      {/* G6: substance-use symptoms in play (selected, matched or answered) bring up the 42 CFR Part 2 prompt. */}
      {analysis.sud ? <HubPrompt context="sud" className="mb-6" /> : null}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_23rem] lg:items-start">
        <div className="min-w-0 space-y-6">
          {/* Remount on every reset so drafts, search text and notices clear with the session (G5). */}
          <DescribeStep key={`text-${resetCount}`} analysis={analysis} />
          <FoundStep analysis={analysis} />
          <AskMoreStep analysis={analysis} catalog={catalog} assistant={assistant} />
          <ContextStep />
          <PickerStep key={`picker-${resetCount}`} analysis={analysis} />
        </div>
        {/* Sticky on wide screens so the running list and its call to action stay in view while browsing chips. */}
        <IncludedSummary analysis={analysis} className="order-last min-w-0 lg:sticky lg:top-4 lg:order-none" />
      </div>
    </>
  );
}
