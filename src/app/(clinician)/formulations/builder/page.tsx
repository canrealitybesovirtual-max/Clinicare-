import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { behaviorFunctions, formulationFactors, worksheetFormulations } from "@/lib/formulations";
import { toWorksheetTemplate, worksheetLibrary } from "@/lib/formulation/worksheet";
import { interventions } from "@/lib/library";
import { PageIntro } from "@/components/content/content-meta";
import { HubPrompt } from "@/components/hub/hub-prompt";
import { FormulationBuilder } from "@/components/formulations/formulation-builder";

export const metadata: Metadata = { title: "Formulation worksheet" };

export default function FormulationBuilderPage() {
  const library = worksheetLibrary(
    formulationFactors,
    behaviorFunctions,
    Object.fromEntries(interventions.map((i) => [i.id, i.name])),
  );
  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/formulations" className="-mt-2 mb-1 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-accent">
        <ArrowLeft aria-hidden className="size-4" />
        All formulations
      </Link>
      <PageIntro title="Formulation worksheet" compact>
        <p>
          Build a shared, working formulation with the client: tap the factors that fit, add a few words, then copy or
          export it. Documented symptoms and measure results from this session can be included. It never states a
          diagnosis and never decides risk.
        </p>
      </PageIntro>
      <FormulationBuilder
        templates={worksheetFormulations.map(toWorksheetTemplate)}
        library={library}
        sudPrompt={<HubPrompt context="sud" />}
      />
    </div>
  );
}
