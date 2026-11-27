import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { MEDICATIONS, MEDICATION_CATEGORIES, MEDICATION_CATEGORY_LABELS, NIMH_MEDICATIONS_URL, medicationsFile } from "@/lib/schemas-medications";
import { Card } from "@/components/ui/card";
import { ExternalLink } from "@/components/ui/external-link";
import { Notice } from "@/components/ui/notice";
import { Governance, PageIntro, ReviewBadge, SourcesList } from "@/components/content/content-bits";
import { MedicationBrowser } from "@/components/medications/medication-browser";
import { NOT_FOR_PRESCRIBING, toListItem } from "@/components/medications/medication-labels";

export const metadata: Metadata = { title: "Medication reference" };

/**
 * Clinician-only medication reference (education for referral conversations; never prescribing or dosing).
 * The server passes slim list items to the client browser; full entries render on /medications/[id].
 */
export default function MedicationsPage() {
  const items = MEDICATIONS.map(toListItem);
  const categories = MEDICATION_CATEGORIES.map((id) => ({ id, label: MEDICATION_CATEGORY_LABELS[id] }));

  return (
    <>
      <PageIntro
        title="Medication reference"
        eyebrow="Clinician mode · for referral conversations"
        badges={<ReviewBadge reviewedBy={medicationsFile.reviewedBy} />}
      >
        <p>
          A curated list of {items.length} psychotropic and alcohol use disorder medications: class, brand names, common
          uses, notable cautions, and the current FDA label. It helps you talk about a medication referral. It is not
          prescribing, dosing, switching or tapering guidance.
        </p>
      </PageIntro>

      <Notice tone="warn" title={NOT_FOR_PRESCRIBING} className="mb-6 max-w-3xl">
        <p>
          Medication decisions belong to a prescriber: a psychiatrist, the client&apos;s primary care clinician or a
          psychiatric nurse practitioner.{" "}
          <Link href="/referrals#medication-evaluation" className="font-semibold text-accent underline underline-offset-2">
            Find a prescriber
          </Link>
          .
        </p>
      </Notice>

      <MedicationBrowser items={items} categories={categories} />

      <section aria-labelledby="med-about" className="mt-10">
        <Card className="space-y-4">
          <h2 id="med-about" className="text-lg font-semibold">
            About this list
          </h2>
          <p className="text-sm leading-relaxed">{medicationsFile.scope}</p>
          <p className="text-sm">
            <ExternalLink href={NIMH_MEDICATIONS_URL} className="inline-flex min-h-11 items-center">
              NIMH: Mental health medications (overview)
            </ExternalLink>
          </p>
          <SourcesList sources={medicationsFile.sources} />
          <Governance license={medicationsFile.license} lastVerified={medicationsFile.lastVerified} reviewedBy={medicationsFile.reviewedBy} />
          <p>
            <Link href="/referrals#medication-evaluation" className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-accent underline underline-offset-2">
              Refer for a medication evaluation
              <ArrowRight aria-hidden className="size-4" />
            </Link>
          </p>
        </Card>
      </section>
    </>
  );
}
