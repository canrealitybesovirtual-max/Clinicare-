"use client";
import * as React from "react";
import Link from "next/link";
import { Layers, Link2 } from "lucide-react";
import { ChipToggle } from "@/components/formulations/chip-toggle";
import { Badge } from "@/components/ui/badge";
import { Disclosure } from "@/components/ui/disclosure";
import { ExternalLink } from "@/components/ui/external-link";
import { CARE_STEP_LABELS } from "@/lib/schemas-phase2";
import { usePlan } from "./plan-context";
import { toggleObjectiveTarget, type PlanObjectiveDraft, type PlanProblemDraft } from "./plan-model";

const ACRONYMS: Record<string, string> = { pcbh: "PCBH", ipv: "IPV", cbt: "CBT" };

/** Readable fallback name for a curated practice-guide id whose guide is not loaded (validate-content flags it). */
function practiceName(id: string): string {
  const words = id.split("-").map((w) => ACRONYMS[w] ?? w);
  return [words[0]!.charAt(0).toUpperCase() + words[0]!.slice(1), ...words.slice(1)].join(" ");
}

const linkClass = "inline-flex min-h-11 items-center text-sm font-semibold text-accent underline underline-offset-2";

/**
 * Reference Z codes and curated links of a library or module problem: formulation frameworks, practice guides,
 * client handouts and official link-outs. Names come from the server page (curated ids only).
 */
export function ProblemExtras({ problem }: { problem: PlanProblemDraft }) {
  const { linkNames } = usePlan();
  const { formulationIds, practiceIds, handoutIds, linkOuts } = problem.links;
  const count = formulationIds.length + practiceIds.length + handoutIds.length + linkOuts.length;
  return (
    <div className="space-y-2">
      {problem.zCodes.length ? (
        <div className="text-xs leading-relaxed">
          <span className="font-semibold">Reference Z codes</span>
          <span className="text-muted"> (circumstances, not a diagnosis; confirm in the current ICD-10-CM): </span>
          <ul className="mt-1 flex flex-wrap gap-1.5">
            {problem.zCodes.map((z) => (
              <li key={z.code}>
                <Badge tone="neutral">
                  <span className="font-mono">{z.code}</span> <span className="font-normal">{z.label}</span>
                </Badge>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {count ? (
        <Disclosure title="Related guides, handouts and resources" meta={String(count)} icon={Link2} bordered={false} bodyClassName="pb-1">
          <ul className="space-y-0.5">
            {formulationIds.map((id) => (
              <li key={`f-${id}`}>
                <Link href={`/formulations/${id}`} className={linkClass}>
                  Formulation: {linkNames.formulations[id] ?? id}
                </Link>
              </li>
            ))}
            {practiceIds.map((id) => (
              <li key={`p-${id}`}>
                <Link href={`/practice/${id}`} className={linkClass}>
                  Practice guide: {linkNames.practice[id] ?? practiceName(id)}
                </Link>
              </li>
            ))}
            {handoutIds.map((id) => (
              <li key={`h-${id}`}>
                <Link href={`/handouts/${id}`} className={linkClass}>
                  Client handout: {linkNames.handouts[id] ?? id}
                </Link>
              </li>
            ))}
            {linkOuts.map((l) => (
              <li key={l.url}>
                <ExternalLink href={l.url} className="inline-flex min-h-11 items-center text-sm">
                  {l.title}
                </ExternalLink>
                <span className="text-xs text-muted"> · {l.publisher}</span>
              </li>
            ))}
          </ul>
        </Disclosure>
      ) : null}
    </div>
  );
}

/**
 * Care-level badge, and, once the clinician has tapped formulation targets, the ones this objective works on. A chosen
 * objective can then be linked to any tapped target (curated chips, nothing typed). Without a formulation the target
 * tags stay out of view, so long objective lists stay calm.
 */
export function ObjectiveTags({ problem, objective }: { problem: PlanProblemDraft; objective: PlanObjectiveDraft }) {
  const { draft, update, targetMap } = usePlan();
  const chosen = new Set(draft.formulationTargets);
  const known = objective.targets.filter((t) => chosen.has(t) && targetMap.has(t));
  if (!objective.step && !known.length && !(objective.selected && chosen.size)) return null;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        {objective.step ? (
          <Badge tone="info">
            <Layers aria-hidden className="size-3.5" />
            <span className="sr-only">Usual level of care: </span>
            {CARE_STEP_LABELS[objective.step]}
          </Badge>
        ) : null}
        {known.length ? <span className="text-muted">Works on your formulation:</span> : null}
        {known.map((t) => (
          <Badge key={t} tone="accent">
            {targetMap.get(t)!.label}
          </Badge>
        ))}
      </div>
      {objective.selected && chosen.size ? (
        <Disclosure title="Link to your formulation" icon={Link2} bordered={false} bodyClassName="pb-1">
          <ul className="flex flex-wrap gap-2" aria-label="Formulation targets this objective works on">
            {draft.formulationTargets.map((t) => {
              const on = objective.targets.includes(t);
              return (
                <li key={t} className="max-w-full">
                  <ChipToggle pressed={on} onToggle={() => update((d) => toggleObjectiveTarget(d, problem.id, objective.id, t, !on))}>
                    {targetMap.get(t)?.label ?? t}
                  </ChipToggle>
                </li>
              );
            })}
          </ul>
        </Disclosure>
      ) : null}
    </div>
  );
}
