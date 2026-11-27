"use client";
import * as React from "react";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, BookOpen, FlaskConical, RotateCcw, Sparkles } from "lucide-react";
import { conditions, getSymptom, lexicon } from "@/lib/content";
import { scoreConditions } from "@/lib/scoring";
import type { Suggestion } from "@/lib/types";
import {
  VIGNETTES,
  VIGNETTE_GOVERNANCE,
  compareRuns,
  stateAtStep,
  type SuggestionChange,
  type Vignette,
  type VignetteContext,
} from "@/lib/tools/vignettes";
import { STRENGTH_LABEL } from "@/components/diagnoses/explain";
import { DURATION_CHOICES, TRI_CHOICES } from "@/components/symptoms/symptom-meta";
import { CrisisInline } from "@/components/crisis/crisis-panel";
import { ClinicianReviewBadge, Governance, SourcesList } from "@/components/content/content-meta";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ChoiceGroup } from "@/components/ui/choice-group";
import { Disclosure } from "@/components/ui/disclosure";
import { Notice } from "@/components/ui/notice";
import { CheckRow } from "./check-row";

const run = (symptomIds: string[], context: VignetteContext) => scoreConditions({ symptomIds, ...context }, conditions, lexicon.symptoms);

const CHANGE_TEXT: Record<SuggestionChange["kind"], string> = {
  new: "New at this step",
  stronger: "Stronger than the last step",
  weaker: "Weaker than the last step",
  same: "",
  dropped: "No longer suggested",
};

/** Sandbox state: starts from the vignette step; edits stay here and never reach the live session. */
interface Sandbox {
  symptomIds: string[];
  context: VignetteContext;
}

/**
 * Training vignettes. Fictional cases load into a sandboxed scoring run (local state only); the clinician's live
 * session is never read or changed here.
 */
export function PracticeTool() {
  const [vignetteId, setVignetteId] = React.useState(VIGNETTES[0]!.id);
  const [stepIndex, setStepIndex] = React.useState(0);
  const v = VIGNETTES.find((x) => x.id === vignetteId) ?? VIGNETTES[0]!;
  const stepState = React.useMemo(() => stateAtStep(v, stepIndex), [v, stepIndex]);
  const [sandbox, setSandbox] = React.useState<Sandbox | null>(null);
  const current = sandbox ?? stepState;
  const headingRef = React.useRef<HTMLHeadingElement>(null);

  const result = React.useMemo(() => run(current.symptomIds, current.context), [current]);
  const before = React.useMemo(() => {
    if (sandbox) return run(stepState.symptomIds, stepState.context).suggestions;
    if (stepIndex === 0) return null;
    const prev = stateAtStep(v, stepIndex - 1);
    return run(prev.symptomIds, prev.context).suggestions;
  }, [sandbox, stepState, stepIndex, v]);
  const changes = compareRuns(before, result.suggestions);
  const allIds = [...new Set(v.steps.flatMap((s) => s.add))];
  const step = v.steps[stepIndex]!;

  function goTo(i: number) {
    setStepIndex(i);
    setSandbox(null);
    headingRef.current?.focus();
  }
  function pick(id: string) {
    setVignetteId(id);
    setStepIndex(0);
    setSandbox(null);
  }
  const edit = (patch: Partial<Sandbox>) => setSandbox({ ...current, ...patch });

  return (
    <div className="space-y-6">
      <Notice tone="accent" icon={FlaskConical} title="Fictional training cases">
        <p>Nothing here reads or changes your live session. Edits below are a sandbox and clear when you leave the page.</p>
      </Notice>

      <fieldset className="space-y-2">
        <legend className="mb-2 text-base font-semibold">Choose a case</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {VIGNETTES.map((c) => (
            <label
              key={c.id}
              className="flex min-h-11 cursor-pointer flex-col gap-1 rounded-xl border border-border bg-surface p-3 hover:bg-surface-2 has-[:checked]:border-primary has-[:checked]:ring-2 has-[:checked]:ring-primary has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--focus)]"
            >
              <span className="flex items-center gap-2 text-sm font-semibold">
                <input type="radio" name="vignette" value={c.id} checked={c.id === vignetteId} onChange={() => pick(c.id)} className="size-4 accent-[var(--primary)] focus-visible:outline-none" />
                {c.title}
              </span>
              <span className="hidden text-sm text-muted sm:block">{c.summary}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {/* Phones: story, then results, then the sandbox controls. Wide screens: story and controls left, results right. */}
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <Card className="space-y-3 lg:col-start-1">
          <p className="text-sm font-semibold uppercase tracking-wide text-accent">
            Step {stepIndex + 1} of {v.steps.length}: {step.label}
          </p>
          <h2 ref={headingRef} tabIndex={-1} className="text-lg font-semibold leading-snug outline-none">
            {step.story}
          </h2>
          <p className="flex items-start gap-2 rounded-xl bg-info-bg p-3 text-sm text-info-fg">
            <Sparkles aria-hidden className="mt-0.5 size-4 shrink-0" />
            <span>{step.teach}</span>
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => goTo(stepIndex - 1)} disabled={stepIndex === 0}>
              <ArrowLeft aria-hidden />
              Previous step
            </Button>
            <Button type="button" onClick={() => goTo(stepIndex + 1)} disabled={stepIndex === v.steps.length - 1}>
              Next step
              <ArrowRight aria-hidden />
            </Button>
          </div>
        </Card>

        <section aria-labelledby="practice-results" className="space-y-4 lg:col-start-2 lg:row-span-2 lg:row-start-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="practice-results" className="text-lg font-semibold">
              Possible considerations
            </h2>
            <ClinicianReviewBadge />
          </div>
          <p className="sr-only" role="status">
            {result.suggestions.length
              ? `${result.suggestions.length} possible ${result.suggestions.length === 1 ? "consideration" : "considerations"}: ${result.suggestions
                  .map((s) => `${s.name}, ${STRENGTH_LABEL[s.strength]}`)
                  .join("; ")}.`
              : "No possible considerations."}
          </p>

          {result.redFlags.length ? (
            <Notice tone="crisis" title="Red flag in this case">
              <p>
                {result.redFlags.map((f) => f.label).join("; ")}. In a real session, ask directly and follow your crisis
                protocol. The app shows this so it is never missed; it does not decide risk.
              </p>
              <CrisisInline />
            </Notice>
          ) : null}

          {result.status !== "ok" ? <p className="rounded-xl bg-surface-2 p-4 text-sm">{result.message}</p> : null}

          {result.suggestions.map((s, i) => (
            <PracticeResult key={s.conditionId} s={s} rank={i + 1} change={changes.find((c) => c.conditionId === s.conditionId)} />
          ))}
          {changes
            .filter((c) => c.kind === "dropped")
            .map((c) => (
              <p key={c.conditionId} className="rounded-xl border border-dashed border-border p-3 text-sm text-muted">
                {c.name}: no longer suggested (was {STRENGTH_LABEL[c.before!].toLowerCase()}).
              </p>
            ))}
        </section>

        <Card className="space-y-4 lg:col-start-1 lg:row-start-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold">Try changes</h2>
            {sandbox ? (
              <Button type="button" variant="ghost" size="sm" onClick={() => setSandbox(null)}>
                <RotateCcw aria-hidden />
                Back to this step
              </Button>
            ) : null}
          </div>
          <fieldset className="space-y-2">
            <legend className="mb-1 text-sm font-semibold">Documented features in this case</legend>
            {allIds.map((id) => (
              <CheckRow
                key={id}
                checked={current.symptomIds.includes(id)}
                onChange={(on) =>
                  edit({ symptomIds: on ? [...current.symptomIds, id] : current.symptomIds.filter((x) => x !== id) })
                }
              >
                {getSymptom(id)?.label ?? id}
              </CheckRow>
            ))}
          </fieldset>
          <ChoiceGroup
            legend="How long"
            name="practice-duration"
            value={current.context.duration}
            options={DURATION_CHOICES}
            onChange={(duration) => edit({ context: { ...current.context, duration } })}
          />
          <div className="grid gap-4 sm:grid-cols-3">
            <ChoiceGroup legend="Distress or impairment" name="practice-impairment" value={current.context.impairment} options={TRI_CHOICES} onChange={(impairment) => edit({ context: { ...current.context, impairment } })} />
            <ChoiceGroup legend="Substance could explain" name="practice-substance" value={current.context.substancePossible} options={TRI_CHOICES} onChange={(substancePossible) => edit({ context: { ...current.context, substancePossible } })} />
            <ChoiceGroup legend="Medical cause possible" name="practice-medical" value={current.context.medicalPossible} options={TRI_CHOICES} onChange={(medicalPossible) => edit({ context: { ...current.context, medicalPossible } })} />
          </div>
        </Card>
      </div>

      <Card className="space-y-3">
        <h2 className="text-base font-semibold">About these cases</h2>
        <p className="text-sm text-muted">
          The cases are fictional and written for this app. The suggestions come from the same scorer as the Diagnoses
          screen and are possible considerations for clinician review, never a diagnosis.
        </p>
        <SourcesList sources={[...VIGNETTE_GOVERNANCE.sources]} />
        <Governance license={VIGNETTE_GOVERNANCE.license} lastVerified={VIGNETTE_GOVERNANCE.lastVerified} reviewedBy={VIGNETTE_GOVERNANCE.reviewedBy} />
      </Card>
    </div>
  );
}

function FeatureList({ title, items, empty }: { title: string; items: Suggestion["matched"]; empty: string }) {
  return (
    <div>
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</h4>
      {items.length ? (
        <ul className="mt-1 list-disc space-y-1 pl-5">
          {items.map((f) => (
            <li key={f.symptomId}>
              {f.label} <span className="text-muted">({f.kind}, weight {f.weight})</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-muted">{empty}</p>
      )}
    </div>
  );
}

function PracticeResult({ s, rank, change }: { s: Suggestion; rank: number; change?: SuggestionChange }) {
  const missingCore = s.missing.filter((f) => f.kind === "core");
  const missingAssoc = s.missing.filter((f) => f.kind === "associated");
  const ChangeIcon = change?.kind === "stronger" || change?.kind === "new" ? ArrowUp : ArrowDown;
  return (
    <article aria-labelledby={`practice-${s.conditionId}`} className="rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <ClinicianReviewBadge />
        <Badge tone="neutral">{STRENGTH_LABEL[s.strength]}</Badge>
        {change && CHANGE_TEXT[change.kind] ? (
          <Badge tone="info">
            <ChangeIcon aria-hidden className="size-3.5" />
            {CHANGE_TEXT[change.kind]}
          </Badge>
        ) : null}
        <span className="ml-auto text-xs font-semibold text-muted">Consideration {rank}</span>
      </div>
      <h3 id={`practice-${s.conditionId}`} className="mt-2 text-lg font-bold leading-tight">
        {s.name}
      </h3>
      <p className="text-sm text-muted">Possible consideration, not a diagnosis.</p>
      <p className="mt-2 text-sm">
        <span className="font-semibold">ICD-10-CM</span> {s.icd10cm.map((c) => c.code).join(", ")} ·{" "}
        <span className="font-semibold">ICD-11</span> {s.icd11.map((c) => c.code).join(", ")}
      </p>
      <p className="mt-1 flex items-start gap-1.5 text-sm text-muted">
        <BookOpen aria-hidden className="mt-0.5 size-4 shrink-0" />
        {s.dsmPointer}
      </p>
      {s.flags.length ? (
        <ul className="mt-3 space-y-1.5 text-sm">
          {s.flags.map((f, i) => (
            <li key={`${f.type}-${i}`} className="rounded-lg bg-surface-2 px-3 py-2">
              {f.message}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
        <FeatureList title={`Matched features (${s.matched.length})`} items={s.matched} empty="None yet." />
        <FeatureList title={`Missing core features (${missingCore.length})`} items={missingCore} empty="All core features are documented." />
      </div>
      <Disclosure
        title={`Missing associated features (${missingAssoc.length})`}
        meta={`Why suggested: score ${s.score} of 100`}
        className="mt-3"
      >
        <FeatureList title="Not yet documented" items={missingAssoc} empty="None." />
        <p className="text-xs text-muted">
          The score weighs documented core features (70%) and associated features (30%), then applies the timing and
          rule-out flags above. It describes a feature match, not a likelihood.
        </p>
      </Disclosure>
    </article>
  );
}
