"use client";
import * as React from "react";
import Link from "next/link";
import { ClipboardList, GraduationCap, ListPlus, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChoiceGroup } from "@/components/ui/choice-group";
import { Notice } from "@/components/ui/notice";
import { minutesLabel } from "@/components/interventions/format";
import { usePlan } from "./plan-context";
import { PlanItem } from "./plan-item";
import {
  MEASURE_SCHEDULES,
  REVIEW_INTERVALS,
  addCustomItem,
  addCustomProblem,
  isCustom,
  removeCustomItem,
  removeCustomProblem,
  selectedProblems,
  setItemText,
  setMeasure,
  setProblemLabel,
  setReviewInterval,
  suggestedMeasureIds,
  toggleIntervention,
  toggleItem,
  toggleProblem,
  type ItemList,
  type PlanObjectiveDraft,
  type PlanProblemDraft,
} from "./plan-model";
import { PLAN_MBC_NOTE, PLAN_PHQ9_NOTE } from "./plan-wording";

const problemTitle = (p: PlanProblemDraft) => p.label.text.trim() || "Problem (wording to be added)";

function NeedProblems() {
  const { goTo } = usePlan();
  return (
    <Notice tone="neutral" title="Choose at least one problem first">
      <p>Pick the problems that fit this client, then come back to this step.</p>
      <Button type="button" variant="outline" size="sm" className="min-h-11" onClick={() => goTo("problems")}>
        Go to Problems
      </Button>
    </Notice>
  );
}

/* ------------------------------------------------------------------ problems */

export function ProblemsStep() {
  const { draft, update } = usePlan();
  const addRef = React.useRef<HTMLButtonElement>(null);
  return (
    <div className="space-y-4">
      <p className="text-sm leading-relaxed text-muted">
        Check the problems you and the client agree to work on. Edit the wording so it sounds like the client; nothing is
        in the plan until you check it.
      </p>
      <ul className="space-y-3">
        {draft.problems.map((p) => (
          <PlanItem
            key={p.id}
            item={p.label}
            kind="problem statement"
            onToggle={(sel) => update((d) => toggleProblem(d, p.id, sel))}
            onText={(t) => update((d) => setProblemLabel(d, p.id, t))}
            onRemove={
              isCustom(p.label)
                ? () => {
                    update((d) => removeCustomProblem(d, p.id));
                    addRef.current?.focus();
                  }
                : undefined
            }
          >
            {isCustom(p.label) ? (
              <p className="text-xs text-muted">Add its definitions, goals and objectives in the next steps.</p>
            ) : (
              <p className="text-xs text-muted">
                Library: {p.definitions.length} definitions · {p.goals.length} goals · {p.objectives.length} objectives
              </p>
            )}
          </PlanItem>
        ))}
      </ul>
      <Button ref={addRef} type="button" variant="outline" onClick={() => update((d) => addCustomProblem(d).draft)}>
        <Plus aria-hidden />
        Add a problem in the client’s words
      </Button>
    </div>
  );
}

/* ------------------------------------------------------------------ definitions / goals / objectives */

const LIST_META: Record<ItemList, { kind: string; plural: string; intro: string }> = {
  definitions: {
    kind: "definition",
    plural: "behavioral definitions",
    intro:
      "Observable signs of each problem for this client. Check the ones that fit and edit them to match what the client describes.",
  },
  goals: {
    kind: "goal",
    plural: "long-term goals",
    intro: "Broad outcomes the client wants. One or two per problem is usually enough; phrase them the way the client would.",
  },
  objectives: {
    kind: "objective",
    plural: "objectives",
    intro:
      "Short-term steps that are specific, measurable, achievable, relevant and time-bound (SMART). Agree on the numbers and timeframes with the client, or write your own.",
  },
};

function ProblemList({ problem, list }: { problem: PlanProblemDraft; list: ItemList }) {
  const { update } = usePlan();
  const meta = LIST_META[list];
  const addRef = React.useRef<HTMLButtonElement>(null);
  const headingId = React.useId();
  const items = problem[list];
  return (
    <section aria-labelledby={headingId} className="space-y-3">
      <h3 id={headingId} className="text-base font-semibold">
        {problemTitle(problem)}
      </h3>
      {items.length ? (
        <ul className="space-y-2">
          {items.map((i) => (
            <PlanItem
              key={i.id}
              item={i}
              kind={meta.kind}
              onToggle={(sel) => update((d) => toggleItem(d, problem.id, list, i.id, sel))}
              onText={(t) => update((d) => setItemText(d, problem.id, list, i.id, t))}
              onRemove={() => {
                update((d) => removeCustomItem(d, problem.id, list, i.id));
                addRef.current?.focus();
              }}
            />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">No {meta.plural} yet for this problem.</p>
      )}
      <Button ref={addRef} type="button" variant="outline" size="sm" className="min-h-11" onClick={() => update((d) => addCustomItem(d, problem.id, list).draft)}>
        <Plus aria-hidden />
        Add {/^[aeiou]/.test(meta.kind) ? "an" : "a"} {meta.kind} <span className="sr-only">for {problemTitle(problem)}</span>
      </Button>
    </section>
  );
}

export function ListStep({ list }: { list: ItemList }) {
  const { draft } = usePlan();
  const problems = selectedProblems(draft);
  if (!problems.length) return <NeedProblems />;
  return (
    <div className="space-y-6">
      <p className="text-sm leading-relaxed text-muted">{LIST_META[list].intro}</p>
      {problems.map((p) => (
        <ProblemList key={p.id} problem={p} list={list} />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ interventions */

function ObjectiveInterventions({ problem, objective }: { problem: PlanProblemDraft; objective: PlanObjectiveDraft }) {
  const { draft, update, interventions, interventionMap, option } = usePlan();
  const [toAdd, setToAdd] = React.useState("");
  const base = React.useId();
  const listed = [...new Set([...objective.suggestedInterventionIds, ...objective.interventionIds])].filter((id) => interventionMap.has(id));
  const listedSet = new Set(listed);
  const forCondition = interventions.filter((i) => !listedSet.has(i.id) && i.conditions.includes(draft.conditionId));
  const others = interventions.filter((i) => !listedSet.has(i.id) && !i.conditions.includes(draft.conditionId));

  return (
    <fieldset className="min-w-0 space-y-3 rounded-xl border border-border bg-surface p-3 sm:p-4">
      <legend className="sr-only">Interventions for this objective: {objective.text}</legend>
      <p aria-hidden className="text-sm font-semibold leading-relaxed">
        {objective.text || "Objective (wording to be added)"}
      </p>
      {listed.length ? (
        <ul className="space-y-1.5">
          {listed.map((id) => {
            const iv = interventionMap.get(id)!;
            const cb = `${base}-${id}`;
            const suggested = objective.suggestedInterventionIds.includes(id);
            return (
              <li key={id} className="flex flex-wrap items-start gap-x-3 gap-y-1 rounded-lg px-1 py-1.5">
                <input
                  id={cb}
                  type="checkbox"
                  checked={objective.interventionIds.includes(id)}
                  onChange={(e) => update((d) => toggleIntervention(d, problem.id, objective.id, id, e.target.checked))}
                  aria-describedby={iv.trainingRequired ? `${cb}-training` : undefined}
                  className="mt-0.5 size-5 shrink-0 accent-[var(--accent)]"
                />
                <label htmlFor={cb} className="min-w-0 flex-1 cursor-pointer text-sm">
                  <span className="font-medium">{iv.name}</span>
                  <span className="block text-xs text-muted">
                    {iv.modality} · {minutesLabel(iv.minutes)}
                    {suggested ? " · linked in the library" : " · added by you"}
                  </span>
                  {/* Safety-relevant: visible text (not a tooltip), also the checkbox's description. */}
                  {iv.trainingRequired ? (
                    <span id={`${cb}-training`} className="mt-1 block text-xs text-text">
                      <span className="font-semibold text-warn-fg">Training: </span>
                      {iv.trainingRequired}
                    </span>
                  ) : null}
                </label>
                <span className="flex items-center gap-2 pl-8 sm:pl-0">
                  {iv.trainingRequired ? (
                    <Badge tone="warn">
                      <GraduationCap aria-hidden className="size-3.5" /> Trained clinicians only
                    </Badge>
                  ) : null}
                  <Link
                    href={`/interventions/${id}`}
                    className="inline-flex min-h-11 items-center text-xs font-semibold text-accent underline underline-offset-2"
                  >
                    Details <span className="sr-only">about {iv.name}</span>
                  </Link>
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-muted">No interventions are linked to this objective in the library. Add one below.</p>
      )}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1">
          <label htmlFor={`${base}-add`} className="text-xs font-semibold">
            Add an intervention from the library
          </label>
          <select
            id={`${base}-add`}
            value={toAdd}
            onChange={(e) => setToAdd(e.target.value)}
            className="mt-1 block min-h-11 w-full rounded-lg border border-input-border bg-surface px-3 text-base text-text sm:text-sm"
          >
            <option value="">Choose an intervention…</option>
            {forCondition.length ? (
              <optgroup label={`Often used for ${option.label}`}>
                {forCondition.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
              </optgroup>
            ) : null}
            <optgroup label="Other interventions">
              {others.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </optgroup>
          </select>
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={!toAdd}
          onClick={() => {
            if (!toAdd) return;
            update((d) => toggleIntervention(d, problem.id, objective.id, toAdd, true));
            setToAdd("");
          }}
        >
          <ListPlus aria-hidden />
          Add
        </Button>
      </div>
    </fieldset>
  );
}

export function InterventionsStep() {
  const { draft } = usePlan();
  const problems = selectedProblems(draft);
  if (!problems.length) return <NeedProblems />;
  return (
    <div className="space-y-6">
      <p className="text-sm leading-relaxed text-muted">
        For each objective you checked, choose how you will help. The library’s links are suggestions; check only what you
        will actually use, within your training and scope.
      </p>
      {problems.map((p) => {
        const objectives = p.objectives.filter((o) => o.selected);
        return (
          <section key={p.id} aria-labelledby={`${p.id}-iv-heading`} className="space-y-3">
            <h3 id={`${p.id}-iv-heading`} className="text-base font-semibold">
              {problemTitle(p)}
            </h3>
            {objectives.length ? (
              objectives.map((o) => <ObjectiveInterventions key={o.id} problem={p} objective={o} />)
            ) : (
              <p className="text-sm text-muted">No objectives checked for this problem yet (step 5).</p>
            )}
          </section>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ measures */

export function MeasuresStep() {
  const { draft, update, measures } = usePlan();
  const suggested = suggestedMeasureIds(draft);
  const phqIncluded = measures.some((m) => m.shortName === "PHQ-9" && draft.measures[m.id]?.included);
  return (
    <div className="space-y-5">
      <Notice tone="info" title="Measurement-based care" icon={ClipboardList}>
        <p>{PLAN_MBC_NOTE}</p>
      </Notice>
      <ul className="space-y-3">
        {measures.map((m) => {
          const state = draft.measures[m.id] ?? { included: false, schedule: "every-2-weeks" as const };
          const cb = `plan-measure-${m.id}`;
          return (
            <li key={m.id} className="space-y-3 rounded-xl border border-border bg-surface p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex items-start gap-3">
                  <input
                    id={cb}
                    type="checkbox"
                    checked={state.included}
                    onChange={(e) => update((d) => setMeasure(d, m.id, { included: e.target.checked }))}
                    className="mt-0.5 size-5 shrink-0 accent-[var(--accent)]"
                  />
                  <label htmlFor={cb} className="cursor-pointer text-sm">
                    <span className="font-semibold">Track progress with the {m.shortName}</span>
                    <span className="block text-xs text-muted">{m.name}</span>
                  </label>
                </div>
                {suggested.has(m.id) ? <Badge tone="accent">Suggested for the problems you chose</Badge> : null}
              </div>
              {state.included ? (
                <ChoiceGroup
                  legend={`How often to give the ${m.shortName}`}
                  name={`plan-schedule-${m.id}`}
                  value={state.schedule}
                  options={MEASURE_SCHEDULES}
                  onChange={(v) => update((d) => setMeasure(d, m.id, { schedule: v }))}
                />
              ) : null}
              <Link
                href={`/measures/${m.id}`}
                className="inline-flex min-h-11 items-center text-sm font-semibold text-accent underline underline-offset-2"
              >
                Give the {m.shortName} now
              </Link>
            </li>
          );
        })}
      </ul>
      {phqIncluded ? (
        <Notice tone="warn" title="PHQ-9 item 9">
          <p>{PLAN_PHQ9_NOTE}</p>
        </Notice>
      ) : null}
      <ChoiceGroup
        legend="Review the plan together"
        hint="How often you and the client look at progress and update the plan."
        name="plan-review-interval"
        value={draft.reviewInterval}
        options={REVIEW_INTERVALS}
        onChange={(v) => update((d) => setReviewInterval(d, v))}
      />
    </div>
  );
}
