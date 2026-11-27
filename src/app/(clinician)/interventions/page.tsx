import type { Metadata } from "next";
import Link from "next/link";
import { interventions } from "@/lib/library";
import { NextStep, PageIntro } from "@/components/content/content-bits";
import { Notice } from "@/components/ui/notice";
import { conditionLabel } from "@/components/interventions/catalog";
import { ORIENTATIONS, OTHER_ORIENTATION, orientationsOf } from "@/components/interventions/orientation";
import { InterventionLibrary, type FilterOption, type InterventionCardData } from "@/components/interventions/intervention-library";

export const metadata: Metadata = { title: "Interventions" };

export default function InterventionsPage() {
  const items: InterventionCardData[] = interventions.map((i) => ({
    id: i.id,
    name: i.name,
    modality: i.modality,
    orientations: orientationsOf(i),
    minutes: i.minutes,
    conditions: i.conditions.map((c) => ({ id: c, label: conditionLabel(c) })),
    purpose: i.purpose,
    training: Boolean(i.trainingRequired),
    handoutCount: i.handoutIds.length,
    faith: Boolean(i.faithIntegrated),
    pendingReview: i.reviewedBy === "PENDING",
  }));

  const count = (pred: (i: InterventionCardData) => boolean) => items.filter(pred).length;
  const orientations: FilterOption[] = [...ORIENTATIONS, OTHER_ORIENTATION]
    .map((o) => ({ id: o.id, label: o.label, count: count((i) => i.orientations.includes(o.id)) }))
    .filter((o) => o.count > 0);
  const conditionIds = [...new Set(items.flatMap((i) => i.conditions.map((c) => c.id)))];
  const conditions: FilterOption[] = conditionIds
    .map((id) => ({ id, label: conditionLabel(id), count: count((i) => i.conditions.some((c) => c.id === id)) }))
    .sort((a, b) => a.label.localeCompare(b.label));

  return (
    <>
      <PageIntro title="Interventions" eyebrow="Step 5 · In-session tools">
        <p>
          {items.length} evidence-informed interventions across theoretical orientations, each with clinician steps, an
          original script, time needed, cautions, cultural adaptations and named sources. For clinician review: choose,
          adapt and deliver within your training and scope.
        </p>
      </PageIntro>
      <Notice tone="info" className="mb-6">
        <p>
          Items marked <strong>Trained clinicians only</strong> are overviews for referral or for clinicians with formal
          training in that protocol. To add interventions to a treatment plan, use the{" "}
          <Link href="/plan" className="font-semibold text-accent underline underline-offset-2">
            Plan builder
          </Link>
          .
        </p>
      </Notice>
      <InterventionLibrary items={items} orientations={orientations} conditions={conditions} />
      <NextStep href="/handouts" label="Step 6 · Handouts" />
    </>
  );
}
