"use client";
import * as React from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, BookOpen, Check, ListOrdered, RotateCcw, Users } from "lucide-react";
import { useSession } from "@/state/session";
import { AdultOnly } from "@/components/measures/adult-only";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Disclosure } from "@/components/ui/disclosure";
import { ExternalLink } from "@/components/ui/external-link";
import { Notice } from "@/components/ui/notice";
import { cn } from "@/lib/utils";
import { PlanContext, type PlanBuilderData, type PlanContextValue } from "./plan-context";
import {
  PLAN_STEPS,
  createDraft,
  isCustom,
  isEdited,
  planCounts,
  planRecordsSubstanceUse,
  setStep,
  type PlanCounts,
  type PlanDraft,
  type PlanLibraryOption,
  type PlanStepId,
} from "./plan-model";
import { InterventionsStep, ListStep, MeasuresStep, ProblemsStep } from "./plan-steps";
import { FormulationStep } from "./plan-formulation";
import { ReviewStep } from "./plan-review";
import { PLAN_COLLAB_TITLE } from "./plan-wording";

/** True when the clinician has chosen or written anything that "start over" would discard. */
function hasWork(d: PlanDraft): boolean {
  const c = planCounts(d);
  if (Object.values(c).some((n) => n > 0) || d.moduleIds.length > 0) return true;
  return d.problems.some((p) => [p.label, ...p.definitions, ...p.goals, ...p.objectives].some((i) => isCustom(i) || isEdited(i)));
}

const STEP_COUNT: Partial<Record<PlanStepId, keyof PlanCounts>> = {
  formulation: "formulation",
  problems: "problems",
  definitions: "definitions",
  goals: "goals",
  objectives: "objectives",
  interventions: "interventions",
  measures: "measures",
};

/**
 * Treatment Plan Builder (spec screen 4): focus -> optional formulation -> problems (library and cross-cutting
 * modules) -> behavioral definitions -> long-term goals -> SMART objectives -> interventions -> measures -> review
 * and export. The draft lives in memory only (session state)
 * and clears with Clear session or the idle wipe. Adult scope only (G12).
 */
export function PlanBuilder(props: PlanBuilderData & { sudPrompt: React.ReactNode }) {
  const { resetCount } = useSession();
  return (
    <AdultOnly>
      <BuilderInner key={resetCount} {...props} />
    </AdultOnly>
  );
}

/** Reads ?condition=<id>. Only a curated plan-library id is ever acted on; anything else is ignored. */
function ConditionParam({ onValue }: { onValue: (raw: string | null) => void }) {
  const params = useSearchParams();
  const raw = params.get("condition");
  React.useEffect(() => onValue(raw), [raw, onValue]);
  return null;
}

function BuilderInner({ options, interventions, measures, modules, targets, linkNames, sudPrompt }: PlanBuilderData & { sudPrompt: React.ReactNode }) {
  const { state, updatePlan } = useSession();
  const draft = state.plan;
  const optionMap = React.useMemo(() => new Map(options.map((o) => [o.conditionId, o])), [options]);
  const interventionMap = React.useMemo(() => new Map(interventions.map((i) => [i.id, i])), [interventions]);
  const targetMap = React.useMemo(() => new Map(targets.map((t) => [t.id, t])), [targets]);
  const option = draft ? optionMap.get(draft.conditionId) : undefined;

  const updateRef = React.useRef(updatePlan);
  React.useEffect(() => {
    updateRef.current = updatePlan;
  });

  /* ---- ?condition=<id> preselect (curated ids only) */
  const [paramId, setParamId] = React.useState<string | null>(null);
  const [paramDismissed, setParamDismissed] = React.useState(false);
  const onParam = React.useCallback((raw: string | null) => setParamId(raw && optionMap.has(raw) ? raw : null), [optionMap]);
  React.useEffect(() => {
    const opt = paramId ? optionMap.get(paramId) : undefined;
    if (opt) updateRef.current((prev) => prev ?? createDraft(opt, measures));
  }, [paramId, optionMap, measures]);
  const conflict = paramId && draft && draft.conditionId !== paramId && !paramDismissed ? optionMap.get(paramId) : undefined;

  /* ---- steps and focus */
  const headingRef = React.useRef<HTMLHeadingElement>(null);
  const focusPending = React.useRef(false);
  const goTo = React.useCallback((step: PlanStepId) => {
    focusPending.current = true;
    updateRef.current((prev) => (prev ? setStep(prev, step) : prev));
  }, []);
  const step = draft?.step ?? "focus";
  React.useEffect(() => {
    if (focusPending.current) {
      focusPending.current = false;
      headingRef.current?.focus();
    }
  }, [step]);

  const update = React.useCallback((fn: (d: PlanDraft) => PlanDraft) => updateRef.current((prev) => (prev ? fn(prev) : prev)), []);

  /* ---- choosing, switching and clearing the plan library */
  const [confirm, setConfirmState] = React.useState<{ kind: "switch"; to: string } | { kind: "clear" } | null>(null);
  // The confirm dialog has no trigger element: remember what opened it so focus can go back there on close.
  const openerRef = React.useRef<HTMLElement | null>(null);
  const setConfirm = (next: { kind: "switch"; to: string } | { kind: "clear" } | null) => {
    if (next && typeof document !== "undefined") openerRef.current = document.activeElement as HTMLElement | null;
    setConfirmState(next);
  };
  const start = (conditionId: string) => {
    const opt = optionMap.get(conditionId);
    if (opt) updateRef.current(createDraft(opt, measures));
  };
  const choose = (conditionId: string) => {
    if (!optionMap.has(conditionId) || conditionId === draft?.conditionId) return;
    if (draft && hasWork(draft)) setConfirm({ kind: "switch", to: conditionId });
    else start(conditionId);
  };

  const ctx: PlanContextValue | null =
    draft && option ? { options, interventions, measures, modules, targets, linkNames, draft, option, interventionMap, targetMap, update, goTo } : null;
  const index = PLAN_STEPS.findIndex((s) => s.id === step);
  const current = PLAN_STEPS[index] ?? PLAN_STEPS[0];
  const prev = PLAN_STEPS[index - 1];
  const next = PLAN_STEPS[index + 1];
  const counts = draft ? planCounts(draft) : null;
  // G6: a substance-use library, a tagged item, or plan wording that mentions substance use.
  const recordsSud = draft && option ? planRecordsSubstanceUse(draft, option) : false;

  return (
    <div className="space-y-6">
      <React.Suspense fallback={null}>
        <ConditionParam onValue={onParam} />
      </React.Suspense>

      {conflict && option ? (
        <Notice tone="warn" title={`A plan for ${option.label} is in progress`} role="status">
          <p>
            You opened the builder for {conflict.label}. Starting a new plan clears the current one; nothing was saved
            anywhere.
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              type="button"
              size="sm"
              onClick={() => {
                start(conflict.conditionId);
                setParamDismissed(true);
              }}
            >
              Start a new plan for {conflict.label}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setParamDismissed(true)}>
              Keep working on {option.label}
            </Button>
          </div>
        </Notice>
      ) : null}

      {option ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="info" className="uppercase tracking-wide">
              For clinician review
            </Badge>
            <Badge tone="neutral">Plan library: {option.label}</Badge>
            {option.library.reviewedBy === "PENDING" ? <Badge tone="warn">Not yet clinically reviewed</Badge> : null}
            {recordsSud ? <Badge tone="warn">42 CFR Part 2</Badge> : null}
          </div>
          {step === "focus" ? (
            <Notice tone="accent" icon={Users} title={PLAN_COLLAB_TITLE} titleAs="h2">
              <p>{option.library.collaborativeNote}</p>
            </Notice>
          ) : (
            // After the focus step the guidance folds away so each step starts near the top of the screen.
            <Disclosure
              title={PLAN_COLLAB_TITLE}
              icon={Users}
              bordered={false}
              className="rounded-xl border border-accent/30 bg-accent-soft px-4"
            >
              <p>{option.library.collaborativeNote}</p>
            </Disclosure>
          )}
          {recordsSud ? sudPrompt : null}
        </div>
      ) : null}

      <nav aria-label="Plan steps" className="no-print">
        <ol className="hidden flex-wrap gap-1.5 sm:flex">
          <StepButtons step={step} counts={counts} hasDraft={Boolean(draft)} goTo={goTo} />
        </ol>
        {/* Phones: the step list folds away so the current step starts near the top of the screen. */}
        {draft ? (
          <Disclosure
            title="All steps"
            meta={`${index + 1} of ${PLAN_STEPS.length}`}
            icon={ListOrdered}
            bordered={false}
            className="rounded-xl border border-border bg-surface px-4 sm:hidden"
            bodyClassName="pb-3"
          >
            <ol className="space-y-1.5">
              <StepButtons step={step} counts={counts} hasDraft goTo={goTo} stacked />
            </ol>
          </Disclosure>
        ) : null}
      </nav>

      <section aria-labelledby="plan-step-heading" className="space-y-5 rounded-xl border border-border bg-surface p-4 shadow-sm sm:p-6">
        <div className="space-y-2">
          <h2 id="plan-step-heading" ref={headingRef} tabIndex={-1} className="text-xl font-bold leading-tight outline-none">
            <span className="block text-sm font-semibold uppercase tracking-wide text-accent">
              Step {index + 1} of {PLAN_STEPS.length}
            </span>
            {current.label}
          </h2>
          {/* Progress is in the heading text; the bar is a visual echo of it. */}
          <div aria-hidden className="h-1.5 max-w-3xl overflow-hidden rounded-full bg-border/70">
            <div
              className="h-full rounded-full bg-accent motion-safe:transition-[width] motion-safe:duration-300"
              style={{ width: `${((index + 1) / PLAN_STEPS.length) * 100}%` }}
            />
          </div>
        </div>

        {/* Small screens: Back / Next at the top too, so long steps do not need a scroll to move on. */}
        {draft && (prev || next) ? (
          <div className="flex items-center justify-between gap-2 sm:hidden">
            {prev ? (
              <Button type="button" variant="outline" size="sm" aria-label={`Back one step, to ${prev.label}`} onClick={() => goTo(prev.id)}>
                <ArrowLeft aria-hidden />
                Back
              </Button>
            ) : (
              <span />
            )}
            {next ? (
              <Button type="button" variant="outline" size="sm" aria-label={`Next step, ${next.label}`} onClick={() => goTo(next.id)}>
                Next
                <ArrowRight aria-hidden />
              </Button>
            ) : null}
          </div>
        ) : null}

        <div className="max-w-3xl space-y-5">
          {step === "focus" || !ctx ? (
            <FocusStep
              options={options}
              option={option}
              onChoose={choose}
              onStartOver={() => (draft && hasWork(draft) ? setConfirm({ kind: "clear" }) : updateRef.current(null))}
            />
          ) : (
            <PlanContext.Provider value={ctx}>
              {step === "formulation" ? <FormulationStep /> : null}
              {step === "problems" ? <ProblemsStep /> : null}
              {step === "definitions" ? <ListStep list="definitions" /> : null}
              {step === "goals" ? <ListStep list="goals" /> : null}
              {step === "objectives" ? <ListStep list="objectives" /> : null}
              {step === "interventions" ? <InterventionsStep /> : null}
              {step === "measures" ? <MeasuresStep /> : null}
              {step === "review" ? <ReviewStep /> : null}
            </PlanContext.Provider>
          )}
        </div>

        {draft ? (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
            {prev ? (
              <Button type="button" variant="outline" onClick={() => goTo(prev.id)}>
                <ArrowLeft aria-hidden />
                Back<span className="sr-only">{`: ${prev.label}`}</span>
              </Button>
            ) : (
              <span />
            )}
            {next ? (
              <Button type="button" onClick={() => goTo(next.id)}>
                Next: {next.label}
                <ArrowRight aria-hidden />
              </Button>
            ) : null}
          </div>
        ) : null}
      </section>

      <Dialog open={confirm !== null} onOpenChange={(open) => (!open ? setConfirm(null) : undefined)}>
        <DialogContent
          onCloseAutoFocus={(e) => {
            // No DialogTrigger: return focus to the control that opened the dialog, or to the step heading.
            e.preventDefault();
            const el = openerRef.current;
            (el && el.isConnected ? el : headingRef.current)?.focus();
          }}
        >
          <DialogTitle>
            {confirm?.kind === "switch" ? `Start a new plan for ${optionMap.get(confirm.to)?.label ?? "this condition"}?` : "Start over?"}
          </DialogTitle>
          <DialogDescription>
            Your selections and edits{option ? ` for ${option.label}` : ""} will be cleared. Nothing was saved anywhere.
          </DialogDescription>
          <div className="mt-6 flex flex-wrap justify-end gap-2">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Keep the current plan
              </Button>
            </DialogClose>
            <Button
              type="button"
              onClick={() => {
                if (confirm?.kind === "switch") start(confirm.to);
                else updateRef.current(null);
                setConfirm(null);
              }}
            >
              {confirm?.kind === "switch" ? "Start the new plan" : "Clear this plan"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** The step list: current step marked with aria-current, a check and a count once something is chosen there. */
function StepButtons({
  step,
  counts,
  hasDraft,
  goTo,
  stacked = false,
}: {
  step: PlanStepId;
  counts: PlanCounts | null;
  hasDraft: boolean;
  goTo: (step: PlanStepId) => void;
  stacked?: boolean;
}) {
  return PLAN_STEPS.map((s, i) => {
    const isCurrent = s.id === step;
    const key = STEP_COUNT[s.id];
    const n = key && counts ? counts[key] : 0;
    return (
      <li key={s.id}>
        <button
          type="button"
          disabled={!hasDraft && s.id !== "focus"}
          aria-current={isCurrent ? "step" : undefined}
          onClick={() => goTo(s.id)}
          className={cn(
            "inline-flex min-h-11 items-center gap-2 rounded-full border px-3 text-sm font-medium transition-colors disabled:opacity-50",
            "forced-colors:aria-[current=step]:outline forced-colors:aria-[current=step]:outline-2 forced-colors:aria-[current=step]:outline-[Highlight]",
            stacked && "w-full rounded-lg",
            isCurrent ? "border-primary-solid bg-primary-solid text-primary-solid-fg" : "border-border bg-surface text-text hover:bg-surface-2",
          )}
        >
          <span className="font-semibold">{i + 1}.</span> {s.label}{" "}
          {n > 0 ? (
            <span className={cn("inline-flex items-center gap-0.5 rounded-full px-1.5 text-xs", isCurrent ? "bg-black/25" : "bg-accent-soft text-accent")}>
              <Check aria-hidden className="size-3" />
              {n}
              <span className="sr-only"> chosen</span>
            </span>
          ) : null}
        </button>
      </li>
    );
  });
}

function FocusStep({
  options,
  option,
  onChoose,
  onStartOver,
}: {
  options: PlanLibraryOption[];
  option: PlanLibraryOption | undefined;
  onChoose: (conditionId: string) => void;
  onStartOver: () => void;
}) {
  const codes = option
    ? [option.icd10cm.length ? `ICD-10-CM ${option.icd10cm.join(", ")}` : "", option.icd11.length ? `ICD-11 ${option.icd11.join(", ")}` : ""].filter(Boolean)
    : [];
  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="plan-condition" className="text-sm font-semibold">
          Plan library
        </label>
        <p id="plan-condition-hint" className="mt-0.5 text-sm text-muted">
          Choose the library that fits your own assessment. It is a starting point for planning with the client, not a
          diagnosis.
        </p>
        <select
          id="plan-condition"
          aria-describedby="plan-condition-hint"
          value={option?.conditionId ?? ""}
          onChange={(e) => onChoose(e.target.value)}
          className="mt-2 block min-h-11 w-full max-w-md rounded-lg border border-input-border bg-surface px-3 text-base text-text"
        >
          <option value="" disabled={Boolean(option)}>
            Choose a condition…
          </option>
          {options.map((o) => (
            <option key={o.conditionId} value={o.conditionId}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {option ? (
        <div className="space-y-3 rounded-xl border border-border bg-surface-2 p-4 text-sm">
          <p>
            <span className="font-semibold">{option.label}</span>
            {codes.length ? <span className="text-muted"> · reference codes to confirm through your own assessment: {codes.join("; ")}</span> : null}
            <span className="text-muted"> · See DSM-5-TR.</span>
          </p>
          <p className="text-muted">
            {option.library.problems.length} problems ·{" "}
            {option.library.problems.reduce((n, p) => n + p.shortTermObjectives.length, 0)} objectives in this library.
            Original wording; edit everything with the client.
          </p>
          <Disclosure title={`Library sources (${option.library.sources.length})`} icon={BookOpen} bordered={false} bodyClassName="pb-1">
            <ul className="space-y-1.5">
              {option.library.sources.map((s) => (
                <li key={s.url + s.title}>
                  <ExternalLink href={s.url}>{s.title}</ExternalLink>
                  <span className="text-muted">
                    {" "}
                    · {s.publisher}
                    {s.year ? `, ${s.year}` : ""}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-muted">
              License: original wording (app-authored) · Last verified {option.library.lastVerified} · Clinical review:{" "}
              {option.library.reviewedBy === "PENDING" ? "pending" : option.library.reviewedBy}
            </p>
          </Disclosure>
          <Button type="button" variant="ghost" size="sm" onClick={onStartOver}>
            <RotateCcw aria-hidden />
            Start over
          </Button>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border p-4 text-sm leading-relaxed">
          <p className="font-semibold">How the builder works</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted">
            <li>Choose one of the {options.length} plan libraries above.</li>
            <li>If you like, tap the processes and strengths from your formulation, so the plan can show what each objective works on.</li>
            <li>With the client, check the problems, signs, goals and objectives that fit, one step at a time. Add a cross-cutting module (for example safety, sleep or social needs) when it helps.</li>
            <li>Pick interventions and a measure schedule, then export a plan without identifiers.</li>
          </ol>
          <p className="mt-2 text-muted">Nothing is in the plan until you check it, and nothing is saved.</p>
        </div>
      )}
    </div>
  );
}
