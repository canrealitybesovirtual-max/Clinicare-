import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ClipboardPen, GraduationCap } from "lucide-react";
import { PART2_NOTICE } from "@/lib/referral-links";
import { FAMILY_LABELS, worksheetHref } from "@/lib/schemas-formulations";
import { formulations, getFormulation } from "@/lib/formulations";
import { getAnyCondition, getAnyHandout, getIntervention, legalTopics } from "@/lib/library";
import { getOrientation } from "@/lib/orientations";
import { ClinicianReviewBadge, Governance, NextStep, PageIntro, SourcesList } from "@/components/content/content-meta";
import { HubPrompt } from "@/components/hub/hub-prompt";
import {
  CodesTable,
  FactorMap,
  FormulationBadges,
  FunctionList,
  PartsList,
  RelatedGroup,
  SectionCard,
  type NamedLink,
} from "@/components/formulations/formulation-sections";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ExternalLink } from "@/components/ui/external-link";
import { HelpTip } from "@/components/ui/help-tip";
import { Notice } from "@/components/ui/notice";

export const dynamicParams = false;

export function generateStaticParams() {
  return formulations.map((f) => ({ id: f.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return { title: getFormulation(id)?.name ?? "Formulation" };
}

const legalTitles = new Map(legalTopics.map((t) => [t.id, t.title] as const));

/** Readable name for a curated id whose content lives in another section (practice guides, populations). */
function slugLabel(id: string): string {
  const text = id.replace(/-/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function interventionLink(id: string): NamedLink | null {
  const iv = getIntervention(id);
  return iv ? { href: `/interventions/${iv.id}`, label: iv.name } : null;
}

const conditionName = (id: string) => getAnyCondition(id)?.name ?? null;

export default async function FormulationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const f = getFormulation(id);
  if (!f) notFound();

  const interventionsLinked = f.interventionIds.flatMap((i) => interventionLink(i) ?? []);
  const handouts = f.handoutIds.flatMap((h) => {
    const ho = getAnyHandout(h);
    return ho ? [{ href: `/handouts/${ho.id}`, label: ho.title }] : [];
  });
  const conditions = f.conditionIds.flatMap((c) => conditionName(c) ?? []);
  const related = {
    orientations: f.orientationIds.map((o) => ({ href: `/orientations/${o}`, label: getOrientation(o)?.name ?? slugLabel(o) })),
    practice: f.practiceIds.map((p) => ({ href: `/practice/${p}`, label: slugLabel(p) })),
    populations: f.populationIds.map((p) => ({ href: `/populations/${p}`, label: slugLabel(p) })),
    legal: f.legalIds.map((l) => ({ href: `/ethics#${l}`, label: legalTitles.get(l) ?? slugLabel(l) })),
  };

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/formulations" className="mb-3 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-accent">
        <ArrowLeft aria-hidden className="size-4" /> All formulations
      </Link>
      <PageIntro
        title={f.name}
        eyebrow={`Formulation · ${FAMILY_LABELS[f.family]}`}
        badges={
          <>
            <ClinicianReviewBadge />
            <FormulationBadges f={f} />
          </>
        }
      >
        <p>{f.purpose}</p>
      </PageIntro>

      <div className="space-y-6">
        {f.worksheet ? (
          <Card className="flex flex-wrap items-center justify-between gap-3">
            <p className="min-w-0 flex-1 text-sm">
              Fill this in with the client on the memory-only worksheet: tap the factors that fit, add a few words, then
              copy or print a copy that is safe to share.
            </p>
            <Link href={worksheetHref(f.id)} className={buttonVariants({ variant: "primary" })}>
              <ClipboardPen aria-hidden />
              Open the worksheet
            </Link>
          </Card>
        ) : null}

        {f.trainingRequired ? (
          <Notice tone="warn" title="Trained clinicians only" icon={GraduationCap}>
            <p>{f.trainingRequired}</p>
            {f.trainingPath?.length ? (
              <ul className="space-y-1.5 pt-1">
                {f.trainingPath.map((t) => (
                  <li key={t.url}>
                    <ExternalLink href={t.url}>{t.body}</ExternalLink>
                    <span className="text-muted"> · {t.note}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </Notice>
        ) : null}

        {f.sud ? (
          <>
            <Notice tone="warn" title="42 CFR Part 2">
              <p>Records of substance-use care carry the notice: {PART2_NOTICE}</p>
            </Notice>
            <HubPrompt context="sud" />
          </>
        ) : null}

        <section aria-labelledby="cautions">
          <h2 id="cautions" className="sr-only">
            Cautions
          </h2>
          <Notice tone="warn" title="Cautions">
            <ul className="list-disc space-y-1.5 pl-5">
              {f.cautions.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </Notice>
        </section>

        <HelpTip title="How to use this page">
          <p>
            Read the cautions first. The parts below describe the framework in this resource’s own words; the steps say how
            to build it with the client. Linked interventions and handouts are options for clinician review, never a
            treatment decision.
          </p>
          <p>Formulations are shared, revisable explanations. They are not diagnoses and they never score or decide risk.</p>
        </HelpTip>

        <SectionCard id="when" title="When to use it">
          <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed">
            {f.whenToUse.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </SectionCard>

        <SectionCard id="parts" title={f.id === "disorder-maintenance-models" ? "The models" : "The parts"}>
          <PartsList parts={f.structure} interventionLink={interventionLink} conditionName={conditionName} />
        </SectionCard>

        {f.factors?.length ? (
          <SectionCard id="factors" title="The curated factors">
            <p className="text-sm text-muted">
              The same names appear on the worksheet chips and as optional targets on treatment-plan objectives. Each lists
              interventions that work on it, for clinician review.
            </p>
            <FactorMap factors={f.factors} interventionLink={interventionLink} />
          </SectionCard>
        ) : null}

        {f.functions?.length ? (
          <SectionCard id="functions" title="Common functions of a behavior">
            <FunctionList functions={f.functions} interventionLink={interventionLink} />
          </SectionCard>
        ) : null}

        <SectionCard id="steps" title="Building it with the client">
          <ol className="list-decimal space-y-2.5 pl-5 text-sm leading-relaxed marker:font-semibold">
            {f.steps.map((s) => (
              <li key={s} className="pl-1">
                {s}
              </li>
            ))}
          </ol>
          <div className="border-t border-border pt-4">
            <h3 className="text-base font-semibold">Keeping it collaborative</h3>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed">
              {f.collaborativeTips.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </div>
        </SectionCard>

        {f.codes?.length && f.dsmPointer ? (
          <SectionCard id="codes" title="Reference codes">
            <p className="text-sm text-muted">
              For the clinician’s own records after a full assessment. Not a diagnosis; the worksheet and client copies never
              print codes.
            </p>
            <CodesTable codes={f.codes} dsmPointer={f.dsmPointer} />
          </SectionCard>
        ) : null}

        <SectionCard id="related" title="Related in this resource">
          <div className="grid gap-5 sm:grid-cols-2">
            <RelatedGroup title="Interventions" items={interventionsLinked} />
            <RelatedGroup title="Client handouts" items={handouts} />
            <RelatedGroup title="Orientations" items={related.orientations} />
            <RelatedGroup title="Practice guides" items={related.practice} />
            <RelatedGroup title="Populations" items={related.populations} />
            <RelatedGroup title="Ethics and legal" items={related.legal} />
          </div>
          {conditions.length ? (
            <p className="border-t border-border pt-4 text-sm">
              <span className="font-semibold">Often relevant to:</span> {conditions.join("; ")}.{" "}
              <span className="text-muted">Possible uses for clinician review; not a diagnosis.</span>
            </p>
          ) : null}
        </SectionCard>

        {f.linkOuts.length || f.measuresPending.length ? (
          <SectionCard id="links" title="Official resources">
            {f.linkOuts.length ? (
              <ul className="space-y-2 text-sm">
                {f.linkOuts.map((l) => (
                  <li key={l.url}>
                    <ExternalLink href={l.url}>{l.title}</ExternalLink>
                    <span className="text-muted">
                      {" "}
                      · {l.publisher}
                      {l.note ? `. ${l.note}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
            {f.measuresPending.length ? (
              <div className="space-y-2 border-t border-border pt-4 first:border-t-0 first:pt-0">
                <h3 className="text-base font-semibold">Measures and tools (link out only)</h3>
                <p className="text-sm text-muted">Not built in: their terms for software use are not confirmed.</p>
                <ul className="space-y-2 text-sm">
                  {f.measuresPending.map((m) => (
                    <li key={m.licenseKey}>
                      <ExternalLink href={m.url}>{m.name}</ExternalLink>
                      {m.note ? <span className="text-muted"> · {m.note}</span> : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </SectionCard>
        ) : null}

        <SectionCard id="sources" title="Sources and review">
          <SourcesList sources={f.sources} />
          <Governance license={f.license} lastVerified={f.lastVerified} reviewedBy={f.reviewedBy} />
        </SectionCard>

        <NextStep href="/plan" label="Plan builder" />
      </div>
    </div>
  );
}
