import type { Metadata } from "next";
import { interventions, planLibraries } from "@/lib/library";
import { measures } from "@/lib/content";
import { PageIntro } from "@/components/content/content-bits";
import { HelpTip } from "@/components/symptoms/help-tip";
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
        <p>Build a plan with the client one step at a time, then export it without identifiers. Nothing is saved.</p>
      </PageIntro>
      <HelpTip title="How to use the plan builder" className="mb-5">
        <p>
          Pick a plan library, then go through the steps with the client: problems, signs you can observe, long-term
          goals, short-term objectives, interventions and a measure schedule. Nothing is in the plan until you check it,
          and every line can be reworded in the client&apos;s own words.
        </p>
        <p>
          The last step exports a PDF or Word file with a blank name line, to paste into your record system. Leave out
          names and other identifiers; anything that looks like one is removed. The plan clears when you close the tab,
          press Clear session, or step away for 15 minutes.
        </p>
      </HelpTip>
      <PlanBuilder
        options={options}
        interventions={interventionOptions}
        measures={measureOptions}
        sudPrompt={<HubPrompt context="sud" />}
      />
    </>
  );
}
