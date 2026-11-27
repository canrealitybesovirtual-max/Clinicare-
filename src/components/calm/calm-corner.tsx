"use client";
import * as React from "react";
import { Siren } from "lucide-react";
import type { Source } from "@/lib/schemas";
import { useLang, useT } from "@/lib/i18n/core";
import { CrisisPanel } from "@/components/crisis/crisis-panel";
import { Card } from "@/components/ui/card";
import { ChoiceGroup } from "@/components/ui/choice-group";
import { ExternalLink } from "@/components/ui/external-link";
import { HANDOUT_TEXT } from "@/components/handouts/localize";
import { BREATHE, CALM, GROUND, RELAX } from "./calm-text";
import { BreathingPacer } from "./breathing-pacer";
import { Grounding } from "./grounding";
import { MuscleRelaxation } from "./muscle-relaxation";

type Exercise = "breathe" | "ground" | "relax";

/**
 * Client Calm page (G3: plain language, no diagnosis names, codes or scores; nothing typed or stored). The exercise
 * comes first so it fits the first screen on a phone; the full crisis panel follows right after it, and the shell's
 * "Get help now" button stays on screen throughout (G9).
 */
export function CalmCorner({ sources }: { sources: Source[] }) {
  const t = useT();
  const { lang } = useLang();
  const [exercise, setExercise] = React.useState<Exercise>("breathe");
  const title = { breathe: BREATHE.title, ground: GROUND.title, relax: RELAX.title }[exercise];

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <p className="hidden text-sm font-semibold uppercase tracking-wide text-accent sm:block">{t(CALM.eyebrow)}</p>
        <h1 className="text-2xl font-bold tracking-tight sm:mt-1 sm:text-3xl">{t(CALM.title)}</h1>
        <p className="mt-2 hidden text-lg leading-relaxed text-muted sm:block">{t(CALM.intro)}</p>
      </div>

      <Card className="space-y-5">
        <ChoiceGroup
          legend={t(CALM.choose)}
          name="calm-exercise"
          value={exercise}
          options={[
            { value: "breathe", label: t(CALM.tabBreathe) },
            { value: "ground", label: t(CALM.tabGround) },
            { value: "relax", label: t(CALM.tabRelax) },
          ]}
          onChange={setExercise}
        />
        <section aria-labelledby="calm-exercise-title">
          {/* The chosen option already names the exercise on screen; the heading keeps the page outline. */}
          <h2 id="calm-exercise-title" className="sr-only">
            {t(title)}
          </h2>
          {exercise === "breathe" ? <BreathingPacer /> : exercise === "ground" ? <Grounding /> : <MuscleRelaxation />}
        </section>
      </Card>

      <Card className="border-crisis/30">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-bold">
          <Siren aria-hidden className="size-5 text-crisis" />
          {t(CALM.helpNow)}
        </h2>
        <CrisisPanel plain headingLevel="h3" />
      </Card>

      <section aria-labelledby="calm-sources" className="space-y-2 text-sm text-muted">
        <h2 id="calm-sources" className="text-base font-semibold text-text">
          {t(CALM.sourcesTitle)}
        </h2>
        <p>{t(CALM.sourcesNote)}</p>
        <ul className="space-y-1.5">
          {sources.map((s) => (
            <li key={s.url} lang="en">
              <ExternalLink href={s.url}>{s.title}</ExternalLink>
              {s.title === s.publisher ? null : ` · ${s.publisher}${s.year ? `, ${s.year}` : ""}`}
            </li>
          ))}
        </ul>
        {lang === "es" ? <p>{HANDOUT_TEXT.machineTranslated.es}</p> : null}
      </section>
    </div>
  );
}
