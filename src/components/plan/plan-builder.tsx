"use client";
import * as React from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, BookOpen, RotateCcw, Users } from "lucide-react";
import { useSession } from "@/state/session";
import { AdultOnly } from "@/components/measures/adult-only";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
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
  setStep,
  type PlanCounts,
  type PlanDraft,
  type PlanLibraryOption,
  type PlanStepId,
} from "./plan-model";
import { InterventionsStep, ListStep, MeasuresStep, ProblemsStep } from "./plan-steps";
import { ReviewStep } from "./plan-review";
import { PLAN_COLLAB_TITLE } from "./plan-wording";

/** True when the clinician has chosen or written anything that "start over" would discard. */
function hasWork(d: PlanDraft): boolean {
  const c = planCounts(d);
  if (Object.values(c).some((n) => n > 0)) return true;
  return d.problems.some((p) => [p.label, ...p.definitions, ...p.goals, ...p.objectives].some((i) => isCustom(i) || isEdited(i)));
}

const STEP_COUNT: Partial<Record<PlanStepId, keyof PlanCounts>> = {
  problems: "problems",
  definitions: "definitions",
  goals: "goals",
  objectives: "objectives",
  interventions: "interventions",
  measures: "measures",
};

/**
 * Treatment Plan Builder (spec screen 4): focus -> problems -> behavioral definitions -> long-term goals ->
 * SMART objectives -> interventions -> measures -> review and export. The draft lives in memory only (session state)
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

function BuilderInner({ options, interventions, measures, sudPrompt }: PlanBuilderData & { sudPrompt: React.ReactNode }) {
  const { state, updatePlan } = useSession();
  const draft = state.plan;
  const optionMap = React.useMemo(() => new Map(options.map((o) => [o.conditionId, o])), [options]);
  const interventionMap = React.useMemo(() => new Map(interventions.map((i) => [i.id, i])), [interventions]);
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
  const [confirm, setConfirm] = React.useState<{ kind: "switch"; to: string } | { kind: "clear" } | null>(null);
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
    draft && option ? { options, interventions, measures, draft, option, interventionMap, update, goTo } : null;
  const index = PLAN_STEPS.findIndex((s) => s.id === step);
  const current = PLAN_STEPS[index] ?? PLAN_STEPS[0];
  const prev = PLAN_STEPS[index - 1];
  const next = PLAN_STEPS[index + 1];
  const counts = draft ? planCounts(draft) : null;

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
              className="min-h-11"
              onClick={() => {
                start(conflict.conditionId);
                setParamDismissed(true);
              }}
            >
              Start a new plan for {conflict.label}
            </Button>
            <Button type="button" variant="outline" size="sm" className="min-h-11" onClick={() => setParamDismissed(true)}>
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
            {option.sud ? <Badge tone="warn">42 CFR Part 2</Badge> : null}
          </div>
          <Notice tone="accent" icon={Users} title={PLAN_COLLAB_TITLE} titleAs="h2">
            <p>{option.library.collaborativeNote}</p>
          </Notice>
          {option.sud ? sudPrompt : null}
        </div>
      ) : null}

      <nav aria-label="Plan steps" className="no-print">
        <ol className="hidden flex-wrap gap-1.5 sm:flex">
          {PLAN_STEPS.map((s, i) => {
            const isCurrent = s.id === step;
            const key = STEP_COUNT[s.id];
            const n = key && counts ? counts[key] : 0;
            return (
              <li key={s.id}>
                <button
                  type="button"
                  disabled={!draft && s.id !== "focus"}
                  aria-current={isCurrent ? "step" : undefined}
                  onClick={() => goTo(s.id)}
                  className={cn(
                    "inline-flex min-h-11 items-center gap-2 rounded-full border px-3 text-sm font-medium transition-colors disabled:opacity-50",
                    isCurrent ? "border-primary bg-primary text-primary-fg" : "border-border bg-surface text-text hover:bg-surface-2",
                  )}
                >
                  <span className="font-semibold">{i + 1}.</span> {s.label}{" "}
                  {n > 0 ? (
                    <span className={cn("rounded-full px-1.5 text-xs", isCurrent ? "bg-primary-fg/20" : "bg-accent-soft text-accent")}>
                      {n}{" "}
                      <span className="sr-only">chosen</span>
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ol>
        <div className="sm:hidden">
          <label htmlFor="plan-step-select" className="text-sm font-semibold">
            Go to step
          </label>
          <select
            id="plan-step-select"
            value={step}
            disabled={!draft}
            onChange={(e) => goTo(e.target.value as PlanStepId)}
            className="mt-1.5 block min-h-11 w-full rounded-lg border border-border bg-surface px-3 text-base text-text"
          >
            {PLAN_STEPS.map((s, i) => (
              <option key={s.id} value={s.id}>
                {i + 1}. {s.label}
              </option>
            ))}
          </select>
        </div>
      </nav>

      <section aria-labelledby="plan-step-heading" className="space-y-5 rounded-xl border border-border bg-surface p-4 shadow-sm sm:p-6">
        <h2 id="plan-step-heading" ref={headingRef} tabIndex={-1} className="text-xl font-bold leading-tight outline-none">
          <span className="block text-sm font-semibold uppercase tracking-wide text-accent">
            Step {index + 1} of {PLAN_STEPS.length}
          </span>
          {current.label}
        </h2>

        {step === "focus" || !ctx ? (
          <FocusStep
            options={options}
            option={option}
            onChoose={choose}
            onStartOver={() => (draft && hasWork(draft) ? setConfirm({ kind: "clear" }) : updateRef.current(null))}
          />
        ) : (
          <PlanContext.Provider value={ctx}>
            {step === "problems" ? <ProblemsStep /> : null}
            {step === "definitions" ? <ListStep list="definitions" /> : null}
            {step === "goals" ? <ListStep list="goals" /> : null}
            {step === "objectives" ? <ListStep list="objectives" /> : null}
            {step === "interventions" ? <InterventionsStep /> : null}
            {step === "measures" ? <MeasuresStep /> : null}
            {step === "review" ? <ReviewStep /> : null}
          </PlanContext.Provider>
        )}

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
        <DialogContent>
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
          className="mt-2 block min-h-11 w-full max-w-md rounded-lg border border-border bg-surface px-3 text-base text-text"
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
          <details className="group">
            <summary className="inline-flex min-h-11 cursor-pointer items-center gap-2 font-semibold text-accent">
              <BookOpen aria-hidden className="size-4" />
              Library sources ({option.library.sources.length})
            </summary>
            <ul className="mt-2 space-y-1.5">
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
          </details>
          <Button type="button" variant="ghost" size="sm" className="min-h-11" onClick={onStartOver}>
            <RotateCcw aria-hidden />
            Start over
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted">
          {options.length} plan libraries are available. Nothing is added to the plan until you check it.
        </p>
      )}
    </div>
  );
}
