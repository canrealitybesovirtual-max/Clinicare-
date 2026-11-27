"use client";
import * as React from "react";
import type { PlanModule } from "@/lib/schemas-phase2";
import type { FormulationTargetOption, InterventionOption, MeasureOption, PlanDraft, PlanLibraryOption, PlanStepId } from "./plan-model";

/** Curated data the server page passes to the builder (no client data). */
export interface PlanBuilderData {
  options: PlanLibraryOption[];
  interventions: InterventionOption[];
  measures: MeasureOption[];
  /** Cross-cutting modules (content/plans/modules); each says which libraries it applies to. */
  modules: PlanModule[];
  /** Curated formulation targets for the optional formulation step. */
  targets: FormulationTargetOption[];
  /** Display names for the formulations, practice guides and handouts that plan problems link to (curated ids only). */
  linkNames: { formulations: Record<string, string>; practice: Record<string, string>; handouts: Record<string, string> };
}

export interface PlanContextValue extends PlanBuilderData {
  draft: PlanDraft;
  option: PlanLibraryOption;
  interventionMap: ReadonlyMap<string, InterventionOption>;
  targetMap: ReadonlyMap<string, FormulationTargetOption>;
  /** Apply a pure update to the latest draft (src/components/plan/plan-model.ts). */
  update: (fn: (d: PlanDraft) => PlanDraft) => void;
  /** Move to a step and put focus on its heading. */
  goTo: (step: PlanStepId) => void;
}

export const PlanContext = React.createContext<PlanContextValue | null>(null);

export function usePlan(): PlanContextValue {
  const ctx = React.useContext(PlanContext);
  if (!ctx) throw new Error("usePlan must be used inside the plan builder");
  return ctx;
}
