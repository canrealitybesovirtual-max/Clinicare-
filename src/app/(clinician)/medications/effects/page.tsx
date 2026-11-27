import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Siren } from "lucide-react";
import { MEDICATIONS } from "@/lib/schemas-medications";
import { LABEL_STATUS_LABELS, MEDICATION_EFFECTS, PSYCH_EFFECT_LABELS, medicationEffectsFile } from "@/lib/schemas-care";
import { getPracticeGuide } from "@/lib/practice";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Disclosure } from "@/components/ui/disclosure";
import { ExternalLink } from "@/components/ui/external-link";
import { Notice } from "@/components/ui/notice";
import { ClinicianReviewBadge, Governance, PageIntro, ReviewBadge, SourcesList } from "@/components/content/content-meta";
import { CrisisInline } from "@/components/crisis/crisis-panel";
import { DrugLabelCheck, type CheckableMedicine } from "@/components/medications/drug-label-check";
import { NOT_FOR_PRESCRIBING, displayGeneric, isSudMedication } from "@/components/medications/medication-labels";

export const metadata: Metadata = { title: "Medicines and mental health effects" };

const checkable: CheckableMedicine[] = MEDICATIONS.map((m) => ({ id: m.id, name: displayGeneric(m.generic), sud: isSudMedication(m) })).sort(
  (a, b) => a.name.localeCompare(b.name),
);
const nameOf = new Map(checkable.map((m) => [m.id, m.name] as const));

/**
 * Clinician-only reference: medicines whose labels list psychiatric effects, a live label check for curated
 * medicines, and psychiatric-medicine red flags (from the practice guide). Education for prescriber conversations.
 */
export default function MedicationEffectsPage() {
  const redFlags = getPracticeGuide("psychotropic-red-flags");
  const howTo = getPracticeGuide("medication-induced-psychiatric-symptoms");

  return (
    <>
      <Link href="/medications" className="mb-3 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-accent">
        <ArrowLeft aria-hidden className="size-4" /> All medications
      </Link>
      <PageIntro
        title="Medicines and mental health effects"
        eyebrow="Clinician mode · medical interface"
        badges={
          <>
            <ClinicianReviewBadge />
            <ReviewBadge reviewedBy={medicationEffectsFile.reviewedBy} />
          </>
        }
        compact
      >
        <p>{medicationEffectsFile.about}</p>
      </PageIntro>

      <Notice tone="warn" title={NOT_FOR_PRESCRIBING} className="mb-6 max-w-3xl">
        <p>
          Ask about every medicine and when symptoms started, then raise it with the prescriber. Encourage the client not to
          stop a medicine on their own.{" "}
          {howTo ? (
            <Link href={`/practice/${howTo.id}`} className="font-semibold text-accent underline underline-offset-2">
              How to raise it
            </Link>
          ) : null}
        </p>
      </Notice>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
        <section aria-labelledby="effects-heading" className="min-w-0 space-y-3">
          <h2 id="effects-heading" className="text-lg font-semibold">
            Examples by medicine
          </h2>
          <ul className="space-y-3">
            {MEDICATION_EFFECTS.map((e) => (
              <li key={e.id}>
                <Card className="space-y-3 p-4 sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h3 className="text-base font-semibold">{e.medicine}</h3>
                    <Badge tone={e.labelStatus === "boxed-warning" ? "warn" : "neutral"}>{LABEL_STATUS_LABELS[e.labelStatus]}</Badge>
                  </div>
                  <p className="text-sm text-muted">Usually prescribed for: {e.usedFor}</p>
                  <p className="flex flex-wrap gap-1.5">
                    {e.effects.map((x) => (
                      <Badge key={x} tone="accent">
                        {PSYCH_EFFECT_LABELS[x]}
                      </Badge>
                    ))}
                  </p>
                  <p className="text-sm leading-relaxed">{e.summary}</p>
                  {e.sud ? <p className="text-xs text-muted">42 CFR Part 2 prohibits unauthorized use or disclosure of these records.</p> : null}
                  {e.medicationIds.length || e.links.length ? (
                    <ul className="flex flex-wrap gap-x-4 text-sm">
                      {e.medicationIds.map((id) => (
                        <li key={id}>
                          <Link
                            href={`/medications/${encodeURIComponent(id)}`}
                            className="inline-flex min-h-11 items-center font-semibold text-accent underline underline-offset-2"
                          >
                            {nameOf.get(id) ?? id}
                          </Link>
                        </li>
                      ))}
                      {e.links.map((l) => (
                        <li key={l.url}>
                          <ExternalLink href={l.url} className="inline-flex min-h-11 items-center">
                            {l.title}
                          </ExternalLink>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <SourcesList sources={e.sources} className="border-t border-border pt-3 text-xs" />
                </Card>
              </li>
            ))}
          </ul>
        </section>

        <div className="min-w-0 space-y-6">
          <DrugLabelCheck medicines={checkable} effectLabels={PSYCH_EFFECT_LABELS} />

          {redFlags ? (
            <section aria-labelledby="red-flags-heading">
              <Card className="space-y-3">
                <h2 id="red-flags-heading" className="flex items-center gap-2 text-lg font-semibold">
                  <Siren aria-hidden className="size-5 text-crisis" />
                  Red flags with psychiatric medicines
                </h2>
                <p className="text-sm text-muted">
                  Severe signs (high fever, rigidity, confusion, slowed breathing, hard to wake) need emergency care now.
                </p>
                <CrisisInline />
                <div>
                  {redFlags.steps.map((s) => (
                    <Disclosure key={s.heading} title={s.heading}>
                      {s.body ? <p>{s.body}</p> : null}
                      {s.items ? (
                        <ul className="list-disc space-y-1 pl-5 marker:text-muted">
                          {s.items.map((i) => (
                            <li key={i}>{i}</li>
                          ))}
                        </ul>
                      ) : null}
                    </Disclosure>
                  ))}
                </div>
                <Link
                  href={`/practice/${redFlags.id}`}
                  className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-accent underline underline-offset-2"
                >
                  Full red-flag guide with sources
                  <ArrowRight aria-hidden className="size-4" />
                </Link>
              </Card>
            </section>
          ) : null}
        </div>
      </div>

      <section aria-labelledby="effects-sources" className="mt-8">
        <Card className="space-y-3">
          <h2 id="effects-sources" className="text-lg font-semibold">
            Sources and review
          </h2>
          <SourcesList sources={medicationEffectsFile.sources} />
          <Governance
            license={medicationEffectsFile.license}
            lastVerified={medicationEffectsFile.lastVerified}
            reviewedBy={medicationEffectsFile.reviewedBy}
          />
        </Card>
      </section>
    </>
  );
}
