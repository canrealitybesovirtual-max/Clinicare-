import type { Metadata } from "next";
import { allHandouts, interventions, planLibraries } from "@/lib/library";
import { measures } from "@/lib/content";
import { formulationFactors, formulations } from "@/lib/formulations";
import { planModules } from "@/lib/plan-modules";
import { practiceGuides } from "@/lib/practice";
import { PageIntro } from "@/components/content/content-meta";
import { HelpTip } from "@/components/ui/help-tip";
import { HubPrompt } from "@/components/hub/hub-prompt";
import { conditionCodes, conditionLabel, isSudCondition } from "@/components/interventions/catalog";
import { PlanBuilder } from "@/components/plan/plan-builder";
import type { FormulationTargetOption, InterventionOption, MeasureOption, PlanLibraryOption } from "@/components/plan/plan-model";

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

  // Curated formulation targets (the transdiagnostic process map's factors) for the optional formulation step.
  const targets: FormulationTargetOption[] = formulationFactors.map((f) => ({ id: f.id, label: f.label, plainLabel: f.plainLabel, kind: f.kind }));

  // Names for the formulations, practice guides and handouts that plan problems link to (only the ids that are used).
  const problems = [...planLibraries.flatMap((l) => l.problems), ...planModules.flatMap((m) => m.problems)];
  const usedFormulations = new Set(problems.flatMap((p) => p.formulationIds ?? []));
  const usedPractice = new Set(problems.flatMap((p) => p.practiceIds ?? []));
  const usedHandouts = new Set(problems.flatMap((p) => p.handoutIds ?? []));
  const linkNames = {
    formulations: Object.fromEntries(formulations.filter((f) => usedFormulations.has(f.id)).map((f) => [f.id, f.name])),
    practice: Object.fromEntries(practiceGuides.filter((g) => usedPractice.has(g.id)).map((g) => [g.id, g.title])),
    handouts: Object.fromEntries(allHandouts.filter((h) => usedHandouts.has(h.id)).map((h) => [h.id, h.title])),
  };

  return (
    <>
      <PageIntro title="Treatment plan builder" eyebrow="Step 4 · Plan with the client" compact>
        <p>Build a plan with the client one step at a time, then export it without identifiers. Nothing is saved.</p>
      </PageIntro>
      <HelpTip title="How to use the plan builder" className="mb-5">
        <p>
          Pick a plan library, then go through the steps with the client: an optional formulation step, problems, signs
          you can observe, long-term goals, short-term objectives, interventions and a measure schedule. Nothing is in
          the plan until you check it, and every line can be reworded in the client&apos;s own words.
        </p>
        <p>
          Cross-cutting modules (for example safety-focused objectives, sleep, engagement, social needs with reference Z
          codes, or a progress review when things stall) can be added to any library in the Problems step. Objectives
          show their usual level of care and the formulation processes they work on; both are for clinician review and
          never decide anything.
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
        modules={planModules}
        targets={targets}
        linkNames={linkNames}
        sudPrompt={<HubPrompt context="sud" />}
      />
    </>
  );
}
