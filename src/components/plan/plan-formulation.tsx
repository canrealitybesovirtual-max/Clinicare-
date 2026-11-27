"use client";
import * as React from "react";
import Link from "next/link";
import { RotateCcw } from "lucide-react";
import { ChipToggle } from "@/components/formulations/chip-toggle";
import { Button } from "@/components/ui/button";
import { usePlan } from "./plan-context";
import { FACTOR_KIND_LABELS, toggleFormulationTarget, type FormulationTargetOption } from "./plan-model";

const KIND_ORDER: FormulationTargetOption["kind"][] = ["maintaining", "context", "strength"];

const KIND_HINTS: Record<FormulationTargetOption["kind"], string> = {
  maintaining: "Processes that seem to keep the difficulties going for this client.",
  context: "Circumstances that add strain and that the plan should take into account.",
  strength: "What already helps, to build on in the plan.",
};

/**
 * Optional step 2: tap the curated formulation targets (factor ids of the transdiagnostic process map) that fit the
 * shared formulation. Nothing is typed here. Later steps mark the objectives that work on each target, and the
 * review shows targets no objective addresses and objectives not linked to any target (for clinician review).
 */
export function FormulationStep() {
  const { draft, update, targets } = usePlan();
  const chosen = new Set(draft.formulationTargets);
  const linked = draft.problems.reduce((n, p) => n + p.objectives.filter((o) => o.targets.some((t) => chosen.has(t))).length, 0);

  return (
    <div className="space-y-6">
      <p className="text-sm leading-relaxed text-muted">
        Optional. Tap what you and the client see in your formulation: the processes that keep things going, the
        circumstances around them and the strengths to build on. Objectives that work on them are marked in the next
        steps, and the review shows any gaps. Use <span className="font-semibold text-text">Next</span> to skip this step.
      </p>

      {KIND_ORDER.map((kind) => {
        const group = targets.filter((t) => t.kind === kind);
        if (!group.length) return null;
        const legendId = `formulation-${kind}`;
        return (
          <fieldset key={kind} aria-describedby={`${legendId}-hint`} className="min-w-0 space-y-2">
            <legend className="text-base font-semibold">{FACTOR_KIND_LABELS[kind]}</legend>
            <p id={`${legendId}-hint`} className="text-sm text-muted">
              {KIND_HINTS[kind]}
            </p>
            <ul className="flex flex-wrap gap-2">
              {group.map((t) => (
                <li key={t.id} className="max-w-full">
                  <ChipToggle pressed={chosen.has(t.id)} onToggle={() => update((d) => toggleFormulationTarget(d, t.id, !chosen.has(t.id)))}>
                    <span className="block">{t.label}</span>
                    <span className="block text-xs font-normal text-muted">In plain words: {t.plainLabel}</span>
                  </ChipToggle>
                </li>
              ))}
            </ul>
          </fieldset>
        );
      })}

      <div className="space-y-3 rounded-xl border border-border bg-surface-2 p-4 text-sm">
        <p role="status" aria-live="polite">
          {chosen.size
            ? `${chosen.size} chosen. ${linked} ${linked === 1 ? "objective" : "objectives"} in this library and its added modules ${linked === 1 ? "works" : "work"} on them.`
            : "Nothing chosen yet. The plan works the same without this step."}
        </p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <Link
            href="/formulations/builder"
            className="inline-flex min-h-11 items-center font-semibold text-accent underline underline-offset-2"
          >
            Open the formulation worksheet
          </Link>
          <Link
            href="/formulations/transdiagnostic-process-map"
            className="inline-flex min-h-11 items-center font-semibold text-accent underline underline-offset-2"
          >
            About these processes
          </Link>
          {chosen.size ? (
            <Button type="button" variant="ghost" size="sm" className="min-h-11" onClick={() => update((d) => ({ ...d, formulationTargets: [] }))}>
              <RotateCcw aria-hidden />
              Clear these choices
            </Button>
          ) : null}
        </div>
        <p className="text-xs text-muted">The worksheet is a separate tool; choices made there are not copied into this plan.</p>
      </div>
    </div>
  );
}
