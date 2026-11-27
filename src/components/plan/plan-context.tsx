"use client";
import * as React from "react";
import type { InterventionOption, MeasureOption, PlanDraft, PlanLibraryOption, PlanStepId } from "./plan-model";

/** Curated data the server page passes to the builder (no client data). */
export interface PlanBuilderData {
  options: PlanLibraryOption[];
  interventions: InterventionOption[];
  measures: MeasureOption[];
}

export interface PlanContextValue extends PlanBuilderData {
  draft: PlanDraft;
  option: PlanLibraryOption;
  interventionMap: ReadonlyMap<string, InterventionOption>;
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
