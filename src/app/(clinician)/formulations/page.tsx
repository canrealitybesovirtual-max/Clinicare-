import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ClipboardPen } from "lucide-react";
import { formulations, formulationsByFamily, worksheetFormulations } from "@/lib/formulations";
import { NextStep, PageIntro } from "@/components/content/content-meta";
import { FormulationCard } from "@/components/formulations/formulation-sections";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { HelpTip } from "@/components/ui/help-tip";

export const metadata: Metadata = { title: "Case formulations" };

const linkClass = "font-semibold text-accent underline underline-offset-2";

export default function FormulationsPage() {
  const groups = formulationsByFamily();
  return (
    <div className="mx-auto max-w-5xl">
      <PageIntro title="Case formulations" eyebrow="Understand the pattern" compact>
        <p>
          {formulations.length} frameworks for building a shared, revisable explanation of what started a person’s
          difficulties and what keeps them going. For clinician review: a formulation is a working hypothesis, never a
          diagnosis and never a risk decision.
        </p>
      </PageIntro>

      <Card className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 sm:flex-1">
          <h2 className="text-base font-semibold">Formulation worksheet</h2>
          <p className="mt-1 text-sm text-muted">
            {worksheetFormulations.map((f) => f.shortName).join(", ")}. Tap factors, add a few words, then copy or print.
            Nothing is saved.
          </p>
        </div>
        <Link href="/formulations/builder" className={buttonVariants({ variant: "primary" })}>
          <ClipboardPen aria-hidden />
          Open the worksheet
        </Link>
      </Card>

      <HelpTip title="How to use these frameworks" className="mb-6">
        <p>
          Start with the 5 Ps grid when you need one picture of everything, or the process map when problems overlap or
          the picture is still unclear. Model-specific frameworks (CBT, behavioral, ACT, psychodynamic) suit work within
          that orientation. Items marked <strong>Trained clinicians only</strong> are overviews for referral or for
          clinicians trained in that approach.
        </p>
        <p>
          Prevention-oriented safety formulation (without risk scores) is in the practice guide{" "}
          <Link href="/practice/self-harm-assessment-and-formulation" className={linkClass}>
            Self-harm assessment and formulation
          </Link>
          , and cultural and ecological adaptation in the population guide{" "}
          <Link href="/populations/cultural-adaptation" className={linkClass}>
            Cultural adaptation
          </Link>
          .
        </p>
      </HelpTip>

      <div className="space-y-8">
        {groups.map((g) => (
          <section key={g.family} aria-labelledby={`family-${g.family}`}>
            <h2 id={`family-${g.family}`} className="mb-3 text-lg font-semibold">
              {g.label}
            </h2>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {g.items.map((f) => (
                <li key={f.id}>
                  <FormulationCard f={f} />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <p className="mt-8 flex items-start gap-2 text-sm text-muted">
        <ArrowRight aria-hidden className="mt-0.5 size-4 shrink-0 text-accent" />
        <span>
          Turn a formulation into goals and objectives in the{" "}
          <Link href="/plan" className={linkClass}>
            Plan builder
          </Link>
          .
        </span>
      </p>
      <NextStep href="/interventions" label="Interventions" />
    </div>
  );
}
