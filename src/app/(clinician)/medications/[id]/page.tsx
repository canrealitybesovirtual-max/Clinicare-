import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BookOpen, ClipboardList, Pill, ShieldAlert } from "lucide-react";
import {
  MEDICATIONS,
  MEDICATION_CATEGORY_LABELS,
  NIMH_MEDICATIONS_URL,
  dailyMedSearchUrl,
  getMedication,
  medicationsFile,
  rxNavConceptUrl,
} from "@/lib/schemas-medications";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ExternalLink } from "@/components/ui/external-link";
import { Notice } from "@/components/ui/notice";
import { Governance, PageIntro, ReviewBadge, SourcesList } from "@/components/content/content-meta";
import { HubPrompt } from "@/components/hub/hub-prompt";
import { HelpTip } from "@/components/ui/help-tip";
import { DrugLabelPanel, RxNormPanel } from "@/components/medications/live-panels";
import { NOT_FOR_PRESCRIBING, deaLabel, displayGeneric, isSudMedication } from "@/components/medications/medication-labels";

export const dynamicParams = false;

export function generateStaticParams() {
  return MEDICATIONS.map((m) => ({ id: m.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const m = getMedication(id);
  return { title: m ? displayGeneric(m.generic) : "Medication" };
}

/** One curated medication (clinician mode): summary, cautions, and live RxNorm / FDA label panels. */
export default async function MedicationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const med = getMedication(id);
  if (!med || med.id !== id) notFound();
  const name = displayGeneric(med.generic);
  const sud = isSudMedication(med);
  const dailyMed = dailyMedSearchUrl(med.generic);

  return (
    <>
      <Link href="/medications" className="mb-3 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-accent">
        <ArrowLeft aria-hidden className="size-4" /> All medications
      </Link>
      <PageIntro
        title={name}
        eyebrow={MEDICATION_CATEGORY_LABELS[med.category]}
        badges={
          <>
            <Badge tone="neutral">{med.class}</Badge>
            {med.boxedWarning ? (
              <Badge tone="warn">
                <ShieldAlert aria-hidden className="size-3.5" />
                Boxed warning
              </Badge>
            ) : null}
            {med.deaSchedule ? <Badge tone="neutral">{deaLabel(med.deaSchedule)}</Badge> : null}
            {sud ? <Badge tone="info">Substance use treatment use</Badge> : null}
            <ReviewBadge reviewedBy={medicationsFile.reviewedBy} />
          </>
        }
      >
        <p>Education for a medication-referral conversation. Medication decisions belong to the prescriber.</p>
      </PageIntro>
      <HelpTip title="How to use this page" className="mb-5">
        <p>
          The left side is a short summary in the app&apos;s own words: class, brands, what it is used for and notable
          cautions. The right side loads the current FDA label (boxed warning first) and RxNorm names when the page opens;
          only this medication&apos;s curated name is sent.
        </p>
        <p>Use it to talk about a referral. Doses, switching and stopping are questions for the prescriber.</p>
      </HelpTip>

      <div className="mb-6 max-w-3xl space-y-3">
        <Notice tone="warn" title={NOT_FOR_PRESCRIBING}>
          <p>
            This page gives no doses, schedules or switching advice. For medication questions refer to a psychiatrist,
            the client&apos;s primary care clinician or a psychiatric nurse practitioner.{" "}
            <Link href="/referrals#medication-evaluation" className="font-semibold text-accent underline underline-offset-2">
              Find a prescriber
            </Link>
            .
          </p>
        </Notice>
        {sud ? <HubPrompt context="sud" /> : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
        <div className="min-w-0 space-y-6">
          <section aria-labelledby="glance-heading">
            <Card className="space-y-4">
              <h2 id="glance-heading" className="flex items-center gap-2 text-lg font-semibold">
                <Pill aria-hidden className="size-5 text-accent" />
                At a glance
              </h2>
              <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
                <dt className="font-semibold">Generic name</dt>
                <dd>{med.generic}</dd>
                <dt className="font-semibold">Class</dt>
                <dd>{med.class}</dd>
                <dt className="font-semibold">US brands</dt>
                <dd>{med.commonBrands.length ? med.commonBrands.join(", ") : "Generic only"}</dd>
                {med.combinationBrands?.length ? (
                  <>
                    <dt className="font-semibold">In combination products</dt>
                    <dd>{med.combinationBrands.join(", ")}</dd>
                  </>
                ) : null}
                {med.formerBrands?.length ? (
                  <>
                    <dt className="font-semibold">Former brand names</dt>
                    <dd>{med.formerBrands.join(", ")} (no longer current RxNorm products)</dd>
                  </>
                ) : null}
                <dt className="font-semibold">Controlled substance</dt>
                <dd>{med.deaSchedule ? deaLabel(med.deaSchedule) : "Not scheduled"}</dd>
                <dt className="font-semibold">Boxed warning</dt>
                <dd>{med.boxedWarning ? "Yes: see the current label below" : "No"}</dd>
                {sud ? (
                  <>
                    <dt className="font-semibold">Substance use</dt>
                    <dd>Has substance use disorder treatment uses. 42 CFR Part 2 may protect related records.</dd>
                  </>
                ) : null}
              </dl>
            </Card>
          </section>

          <section aria-labelledby="usedfor-heading">
            <Card className="space-y-3">
              <h2 id="usedfor-heading" className="flex items-center gap-2 text-lg font-semibold">
                <ClipboardList aria-hidden className="size-5 text-accent" />
                Used for
              </h2>
              <p className="text-xs text-muted">US labeling status: FDA-approved or off-label.</p>
              <ul className="space-y-2">
                {med.usedFor.map((u) => (
                  <li key={u.label} className="flex flex-wrap items-start justify-between gap-2 rounded-lg bg-surface-2 p-3 text-sm">
                    <span className="min-w-0 flex-1">{u.label}</span>
                    <Badge tone={u.status === "fda-approved" ? "accent" : "neutral"}>
                      {u.status === "fda-approved" ? "FDA-approved" : "Off-label"}
                    </Badge>
                  </li>
                ))}
              </ul>
            </Card>
          </section>

          <section aria-labelledby="notes-heading">
            <Card className="space-y-3">
              <h2 id="notes-heading" className="flex items-center gap-2 text-lg font-semibold">
                <ShieldAlert aria-hidden className="size-5 text-accent" />
                Clinician notes
              </h2>
              <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed marker:text-muted">
                {med.clinicianNotes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
              <p className="text-xs text-muted">Notable cautions only, in this app&apos;s own words. Check the full label.</p>
            </Card>
          </section>

          <section aria-labelledby="more-heading">
            <Card className="space-y-3">
              <h2 id="more-heading" className="flex items-center gap-2 text-lg font-semibold">
                <BookOpen aria-hidden className="size-5 text-accent" />
                Plain-language information
              </h2>
              <ul className="space-y-0.5 text-sm">
                {med.medlinePlus.map((m) => (
                  <li key={m.url}>
                    <ExternalLink href={m.url} className="inline-flex min-h-11 items-center">
                      MedlinePlus: {m.title}
                    </ExternalLink>
                  </li>
                ))}
                <li>
                  <ExternalLink href={NIMH_MEDICATIONS_URL} className="inline-flex min-h-11 items-center">
                    NIMH: Mental health medications
                  </ExternalLink>
                </li>
                <li>
                  <ExternalLink href={dailyMed} className="inline-flex min-h-11 items-center">
                    DailyMed: all labels for {med.generic}
                  </ExternalLink>
                </li>
              </ul>
              <p className="text-xs text-muted">Information from MedlinePlus.gov (U.S. National Library of Medicine), linked only.</p>
            </Card>
          </section>
        </div>

        <div className="min-w-0 space-y-6">
          <DrugLabelPanel drug={med.id} name={name} dailyMedSearchUrl={dailyMed} />
          <RxNormPanel
            drug={med.id}
            name={name}
            curatedRxcui={med.rxcui}
            rxNavUrl={rxNavConceptUrl(med.rxcui)}
            dailyMedSearchUrl={dailyMed}
          />
        </div>
      </div>

      <section aria-labelledby="med-sources" className="mt-8">
        <Card className="space-y-3">
          <h2 id="med-sources" className="text-lg font-semibold">
            Sources and review
          </h2>
          <SourcesList sources={medicationsFile.sources} />
          <Governance license={medicationsFile.license} lastVerified={medicationsFile.lastVerified} reviewedBy={medicationsFile.reviewedBy} />
        </Card>
      </section>
    </>
  );
}
