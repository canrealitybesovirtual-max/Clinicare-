import type { Metadata } from "next";
import { interventions, planLibraries } from "@/lib/library";
import { measures } from "@/lib/content";
import { PageIntro } from "@/components/content/content-bits";
import { HubPrompt } from "@/components/hub/hub-prompt";
import { conditionCodes, conditionLabel, isSudCondition } from "@/components/interventions/catalog";
import { PlanBuilder } from "@/components/plan/plan-builder";
import type { InterventionOption, MeasureOption, PlanLibraryOption } from "@/components/plan/plan-model";

export const metadata: Metadata = { title: "Treatment plan builder" };

export default function PlanPage() {
  const options: PlanLibraryOption[] = planLibraries
    .map((library) => ({
      conditionId: library.conditionId,
      label: conditionLabel(library.conditionId),
      ...conditionCodes(library.conditionId),
      sud: library.sud || isSudCondition(library.conditionId),
      library,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const interventionOptions: InterventionOption[] = interventions.map((i) => ({
    id: i.id,
    name: i.name,
    modality: i.modality,
    minutes: i.minutes,
    trainingRequired: i.trainingRequired,
    conditions: i.conditions,
  }));

  // License-confirmed measures only (G7): GAD-7 and PHQ-9.
  const measureOptions: MeasureOption[] = measures.map((m) => ({ id: m.id, shortName: m.shortName, name: m.name }));

  return (
    <>
      <PageIntro title="Treatment plan builder" eyebrow="Step 4 · Plan with the client" compact>
        <p>
          Build a plan together with the client: problems, observable behavioral definitions, long-term goals, SMART
          objectives, interventions and a measurement schedule. All wording is original and editable. Export a plan
          without identifiers (PDF or Word) to paste into your record system. Nothing is saved.
        </p>
      </PageIntro>
      <PlanBuilder
        options={options}
        interventions={interventionOptions}
        measures={measureOptions}
        sudPrompt={<HubPrompt context="sud" />}
      />
    </>
  );
}
