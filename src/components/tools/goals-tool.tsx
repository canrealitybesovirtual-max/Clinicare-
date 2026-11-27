"use client";
import * as React from "react";
import { CircleCheck, CircleDashed, ListPlus, Plus, Ruler, Trash2 } from "lucide-react";
import {
  GAS_LEVELS,
  GAS_RHO,
  GAS_WEIGHTS,
  GOAL_SLOTS,
  GOAL_SLOT_MAX,
  GOAL_TEMPLATES,
  MAX_GAS_GOALS,
  MAX_GOALS,
  MAX_REVIEW_SESSION,
  SMART_LABELS,
  SMART_PARTS,
  composeGoal,
  emptyGasGoal,
  emptyGoalDraft,
  gasMeaning,
  gasSummary,
  getGoalTemplate,
  goalsDoc,
  goalsRecordSubstanceUse,
  levelLabel,
  reviewSessionError,
  smartCheck,
  type GasGoal,
  type GasLevel,
  type GasWeight,
  type GoalDraft,
} from "@/lib/tools/goals";
import { DOC_PART2_NOTICE } from "@/lib/tools/doc-model";
import { useSession } from "@/state/session";
import { ClinicianReviewBadge } from "@/components/content/content-meta";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { cn } from "@/lib/utils";
import { CheckRow } from "./check-row";
import { ExportActions } from "./export-actions";
import { ScrubbedText } from "./scrubbed-text";
import { useFlushRegistry, useLatest } from "./use-latest";

/** How each template's orientation writes goals (content/orientations goalStyle), keyed by template id. */
export type GoalStyles = Record<string, { name: string; goalStyle: string }>;

interface ScaledGoal extends GasGoal {
  uid: number;
}

const selectClass = "block min-h-11 w-full rounded-xl border border-input-border bg-surface px-3 text-base text-text";

/** Goal writer and goal attainment scaling. Everything lives in this screen's memory and clears with the session. */
export function GoalsTool({ styles }: { styles: GoalStyles }) {
  const { resetCount } = useSession();
  return <GoalsInner key={resetCount} styles={styles} />;
}

function StepHeading({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <h2 className="flex items-center gap-2 text-lg font-semibold">
      <span aria-hidden className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-sm text-accent">
        {n}
      </span>
      {children}
    </h2>
  );
}

function GoalsInner({ styles }: { styles: GoalStyles }) {
  const { register, flushAll } = useFlushRegistry();
  const [draft, setDraft, draftRef] = useLatest<GoalDraft>(() => emptyGoalDraft(GOAL_TEMPLATES[0]!.id));
  const [goals, setGoals, goalsRef] = useLatest<string[]>([]);
  const [gas, setGas, gasRef] = useLatest<ScaledGoal[]>([]);
  const [reviewText, setReviewText] = React.useState("");
  const [status, setStatus] = React.useState("");
  const nextUid = React.useRef(1);
  const ids = { template: React.useId(), focus: React.useId(), review: React.useId(), reviewHint: React.useId() };

  const template = getGoalTemplate(draft.templateId) ?? GOAL_TEMPLATES[0]!;
  const style = styles[template.id];
  const preview = composeGoal(draft);
  const smart = smartCheck(draft);
  const reviewNumber = reviewText.trim() === "" ? null : Number(reviewText);
  const reviewError = reviewNumber === null ? null : reviewSessionError(reviewNumber);

  const setSlot = (id: (typeof GOAL_SLOTS)[number]) => (clean: string) => setDraft((d) => ({ ...d, slots: { ...d.slots, [id]: clean } }));
  const setReview = (raw: string) => {
    setReviewText(raw);
    const n = raw.trim() === "" ? null : Number(raw);
    setDraft((d) => ({ ...d, reviewSession: n !== null && reviewSessionError(n) === null ? n : null }));
  };

  function addGoal() {
    flushAll();
    const text = composeGoal(draftRef.current);
    if (!text || goalsRef.current.length >= MAX_GOALS) return;
    setGoals((g) => [...g, text]);
    setDraft(emptyGoalDraft(draftRef.current.templateId));
    setReviewText("");
    setStatus(`Goal ${goalsRef.current.length} added to the list.`);
  }

  function addGas(expected = "") {
    if (gasRef.current.length >= MAX_GAS_GOALS) return;
    const uid = nextUid.current++;
    setGas((list) => [...list, { ...emptyGasGoal(expected), uid }]);
    setStatus(`Scaled goal ${gasRef.current.length} added. Describe each level below.`);
  }

  const updateGas = (uid: number, patch: Partial<GasGoal>) => setGas((list) => list.map((g) => (g.uid === uid ? { ...g, ...patch } : g)));
  const setLevel = (uid: number, level: GasLevel) => (clean: string) =>
    setGas((list) => list.map((g) => (g.uid === uid ? { ...g, levels: { ...g.levels, [`${level}`]: clean } } : g)));

  const summary = gasSummary(gas);
  const sud = goalsRecordSubstanceUse({ goals, gas });

  return (
    <div className="space-y-6">
      <Card className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <ClinicianReviewBadge />
          <span className="text-sm text-muted">Nothing is saved. Do not type names, dates, places or contact details.</span>
        </div>
        <StepHeading n={1}>Write a goal</StepHeading>
        <div className="space-y-1.5">
          <label htmlFor={ids.template} className="block text-sm font-semibold">
            How goals are written
          </label>
          <select
            id={ids.template}
            value={draft.templateId}
            onChange={(e) => setDraft((d) => ({ ...d, templateId: e.target.value, focus: "" }))}
            className={selectClass}
          >
            {GOAL_TEMPLATES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
          <p className="text-sm leading-relaxed text-muted">
            {style ? (
              <>
                <span className="font-semibold text-text">{style.name}:</span> {style.goalStyle}
              </>
            ) : (
              template.guidance
            )}
          </p>
        </div>

        {template.focus ? (
          <div className="space-y-1.5">
            <label htmlFor={ids.focus} className="block text-sm font-semibold">
              {template.focus.label} (optional)
            </label>
            <select id={ids.focus} value={draft.focus} onChange={(e) => setDraft((d) => ({ ...d, focus: e.target.value }))} className={selectClass}>
              <option value="">None</option>
              {template.focus.options.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        {GOAL_SLOTS.map((id) => (
          <ScrubbedText
            key={`${template.id}-${id}`}
            id={`goal-${id}`}
            label={template.slots[id].label}
            hint={template.slots[id].hint}
            value={draft.slots[id]}
            onCommit={setSlot(id)}
            register={register}
            rows={2}
            maxLength={GOAL_SLOT_MAX}
          />
        ))}

        <div className="space-y-1.5">
          <label htmlFor={ids.review} className="block text-base font-semibold">
            Review at session number
          </label>
          <p id={ids.reviewHint} className="text-sm text-muted">
            A session number, not a date. For example: 8.
          </p>
          <input
            id={ids.review}
            type="number"
            inputMode="numeric"
            min={1}
            max={MAX_REVIEW_SESSION}
            value={reviewText}
            onChange={(e) => setReview(e.target.value)}
            aria-describedby={ids.reviewHint}
            aria-invalid={reviewError ? true : undefined}
            className="block min-h-11 w-32 rounded-xl border border-input-border bg-surface px-3 text-base text-text"
          />
          {reviewError ? <p className="text-sm font-medium text-warn-fg">{reviewError}</p> : null}
        </div>

        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm font-semibold">Checked with the client</legend>
          <CheckRow checked={draft.agreed} onChange={(on) => setDraft((d) => ({ ...d, agreed: on }))}>
            The client says this is their goal.
          </CheckRow>
          <CheckRow checked={draft.relevant} onChange={(on) => setDraft((d) => ({ ...d, relevant: on }))}>
            It links to what brought them in and to the formulation.
          </CheckRow>
        </fieldset>

        <div className="space-y-3 rounded-xl bg-surface-2 p-4">
          <h3 className="text-sm font-semibold">Preview</h3>
          <p className={cn("text-base leading-relaxed", !preview && "text-muted")}>{preview || "Fill in the first box to see the goal sentence."}</p>
          <ul aria-label="SMART check" className="flex flex-wrap gap-2">
            {SMART_PARTS.map((p) => (
              <li
                key={p}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold",
                  smart[p] ? "border-accent/40 bg-accent-soft text-accent" : "border-border bg-surface text-muted",
                )}
              >
                {smart[p] ? <CircleCheck aria-hidden className="size-3.5" /> : <CircleDashed aria-hidden className="size-3.5" />}
                {SMART_LABELS[p]}
                <span className="sr-only">{smart[p] ? ": present" : ": missing"}</span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted">
            The check shows which parts are filled in or ticked; it does not judge the goal.
          </p>
        </div>

        <Button type="button" onClick={addGoal} disabled={!preview || goals.length >= MAX_GOALS}>
          <ListPlus aria-hidden />
          Add to the goal list
        </Button>
        {goals.length >= MAX_GOALS ? <p className="text-sm text-muted">The list holds up to {MAX_GOALS} goals.</p> : null}
      </Card>

      <Card className="space-y-4">
        <StepHeading n={2}>Goal list</StepHeading>
        {goals.length ? (
          <ol className="space-y-3">
            {goals.map((g, i) => (
              <li key={`${i}-${g}`} className="rounded-xl border border-border p-4">
                <p className="text-sm leading-relaxed">
                  <span className="font-semibold">Goal {i + 1}.</span> {g}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => addGas(g)} disabled={gas.length >= MAX_GAS_GOALS}>
                    <Ruler aria-hidden />
                    Scale this goal
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setGoals((list) => list.filter((_, j) => j !== i));
                      setStatus(`Goal ${i + 1} removed.`);
                    }}
                  >
                    <Trash2 aria-hidden />
                    Remove<span className="sr-only"> goal {i + 1}</span>
                  </Button>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-muted">No goals yet. Write one above and add it here.</p>
        )}
      </Card>

      <Card className="space-y-5">
        <StepHeading n={3}>Goal attainment scaling (optional)</StepHeading>
        <p className="text-sm leading-relaxed text-muted">
          For up to {MAX_GAS_GOALS} goals, describe five levels with the client. Write the expected level (0) first, then the
          others. Rate where the client is at the start and again at review.
        </p>
        {gas.map((g, i) => (
          <section key={g.uid} aria-labelledby={`gas-${g.uid}-heading`} className="space-y-4 rounded-xl border border-border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 id={`gas-${g.uid}-heading`} className="text-base font-semibold">
                Scaled goal {i + 1}
              </h3>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setGas((list) => list.filter((x) => x.uid !== g.uid));
                  setStatus(`Scaled goal ${i + 1} removed.`);
                }}
              >
                <Trash2 aria-hidden />
                Remove<span className="sr-only"> scaled goal {i + 1}</span>
              </Button>
            </div>
            <ScrubbedText
              id={`gas-${g.uid}-title`}
              label="Goal in a few words"
              value={g.title}
              onCommit={(clean) => updateGas(g.uid, { title: clean })}
              register={register}
              rows={1}
              maxLength={120}
            />
            {[...GAS_LEVELS].reverse().map((level) => (
              <ScrubbedText
                key={level}
                id={`gas-${g.uid}-level-${level}`}
                label={levelLabel(level)}
                hint={level === 0 ? "The realistic result by the review session." : undefined}
                value={g.levels[`${level}`]}
                onCommit={setLevel(g.uid, level)}
                register={register}
                rows={2}
                maxLength={GOAL_SLOT_MAX}
              />
            ))}
            <div className="grid gap-4 sm:grid-cols-3">
              <LevelSelect
                id={`gas-${g.uid}-weight`}
                label="Weight"
                value={String(g.weight)}
                options={GAS_WEIGHTS.map((w) => ({ value: String(w), label: w === 1 ? "1 (usual)" : String(w) }))}
                onChange={(v) => updateGas(g.uid, { weight: Number(v) as GasWeight })}
              />
              <LevelSelect
                id={`gas-${g.uid}-baseline`}
                label="Starting level"
                value={String(g.baseline)}
                options={GAS_LEVELS.map((l) => ({ value: String(l), label: levelLabel(l) }))}
                onChange={(v) => updateGas(g.uid, { baseline: Number(v) as GasLevel })}
              />
              <LevelSelect
                id={`gas-${g.uid}-outcome`}
                label="Level at review"
                value={g.outcome === null ? "" : String(g.outcome)}
                options={[{ value: "", label: "Not rated yet" }, ...GAS_LEVELS.map((l) => ({ value: String(l), label: levelLabel(l) }))]}
                onChange={(v) => updateGas(g.uid, { outcome: v === "" ? null : (Number(v) as GasLevel) })}
              />
            </div>
          </section>
        ))}
        <Button type="button" variant="outline" onClick={() => addGas()} disabled={gas.length >= MAX_GAS_GOALS}>
          <Plus aria-hidden />
          Add a goal to scale
        </Button>

        {gas.length ? (
          <div className="space-y-2 rounded-xl bg-surface-2 p-4" aria-live="polite">
            <h3 className="text-sm font-semibold">Summary T-score</h3>
            <p className="text-sm">
              Starting: <span className="font-semibold">{summary.baselineT ?? "not available"}</span>
              {" · "}
              At review:{" "}
              <span className="font-semibold">
                {summary.reviewT ?? `rate every goal (${summary.rated} of ${gas.length} rated)`}
              </span>
            </p>
            {summary.reviewT !== null ? <p className="text-sm">{gasMeaning(summary.reviewT)}</p> : null}
            <p className="text-xs leading-relaxed text-muted">
              For clinician review. Kiresuk and Sherman formula with an assumed correlation of {GAS_RHO} between goals. Each
              scale is personal, so scores are not comparable between people; use the result to talk about progress, not to
              decide anything.
            </p>
          </div>
        ) : null}
      </Card>

      {sud ? (
        <Notice tone="warn" title="42 CFR Part 2">
          <p>
            These goals mention substance use. Every copy and export carries the notice: {DOC_PART2_NOTICE} Part 2 consent
            rules apply before you share it.
          </p>
        </Notice>
      ) : null}

      <Card className="space-y-4">
        <StepHeading n={4}>Copy or print</StepHeading>
        <p className="text-sm text-muted">
          The sheet has a blank line for the name, written by hand, and the crisis numbers. Review every line before
          you share or file it.
        </p>
        <ExportActions flushAll={flushAll} build={() => goalsDoc({ goals: goalsRef.current, gas: gasRef.current })} />
      </Card>

      <p role="status" className="sr-only">
        {status}
      </p>
    </div>
  );
}

function LevelSelect({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-semibold">
        {label}
      </label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={selectClass}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
