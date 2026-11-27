import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getMeasure, licenses, measures } from "@/lib/content";
import { LOINC_NOTICE, LOINC_PANELS, describeFhirExport } from "@/lib/fhir";
import type { Measure } from "@/lib/schemas";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Governance, NextStep, PageIntro, ReviewBadge, SourcesList } from "@/components/content/content-bits";
import { MeasureForm } from "@/components/measures/measure-form";
import type { FhirExportInfo } from "@/components/measures/fhir-export";
import { AdultOnly } from "@/components/measures/adult-only";

export const dynamicParams = false;

/** LOINC facts for the FHIR export, computed here so the client bundle only loads src/lib/fhir.ts on click. */
function fhirInfo(measure: Measure): FhirExportInfo {
  const d = describeFhirExport(measure);
  const panel = d.available && measure.loinc ? LOINC_PANELS[measure.loinc.panel] : undefined;
  return {
    available: d.available && panel !== undefined,
    note: d.note,
    questionnaire: d.questionnaire,
    panel: panel?.panel,
    total: panel?.total,
    items: panel ? measure.items.map((it) => ({ id: it.id, loinc: panel.items[it.id] ?? "" })) : [],
    functional: d.includesFunctionalItem ? panel?.functional?.code : undefined,
    loincNotice: LOINC_NOTICE,
  };
}

export function generateStaticParams() {
  return measures.map((m) => ({ id: m.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const m = getMeasure(id);
  return { title: m ? m.shortName : "Measure" };
}

export default async function MeasurePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const measure = getMeasure(id);
  if (!measure) notFound();
  const license = licenses.items[measure.licenseKey];

  return (
    <>
      <Link href="/measures" className="mb-3 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-accent">
        <ArrowLeft aria-hidden className="size-4" /> All measures
      </Link>
      <PageIntro
        title={measure.name}
        eyebrow="Step 3 · Measure"
        compact
        badges={
          <>
            <Badge tone="accent">License confirmed</Badge>
            <ReviewBadge reviewedBy={measure.reviewedBy} />
            <Badge tone="neutral">
              {measure.items.length} items · range {measure.scoring.min}–{measure.scoring.max}
            </Badge>
          </>
        }
      >
        <p>
          Read each item aloud or let the client answer. The total updates as you go; the severity band appears once every
          item is answered.
        </p>
      </PageIntro>

      <AdultOnly>
        <MeasureForm measure={measure} fhir={fhirInfo(measure)} />
      </AdultOnly>

      <section aria-labelledby="about-measure" className="mt-8">
        <Card className="space-y-4">
          <h2 id="about-measure" className="text-lg font-semibold">
            Copyright, citation and sources
          </h2>
          <p className="text-sm leading-relaxed">{measure.copyright}</p>
          <p className="text-sm leading-relaxed">
            <span className="font-semibold">Citation: </span>
            {measure.citation}
          </p>
          {license ? (
            <p className="text-sm text-muted">
              License status: <span className="font-semibold text-text">{license.status}</span> — {license.terms}
            </p>
          ) : null}
          {measure.loinc ? (
            <p className="text-sm text-muted">
              LOINC panel <span className="font-mono">{measure.loinc.panel}</span>
              {measure.loinc.total ? (
                <>
                  {" "}
                  · total score <span className="font-mono">{measure.loinc.total}</span>
                </>
              ) : null}
            </p>
          ) : null}
          <SourcesList sources={measure.sources} />
          <Governance license={measure.license} lastVerified={measure.lastVerified} reviewedBy={measure.reviewedBy} />
        </Card>
      </section>
      <NextStep href="/plan" label="Step 4 · Plan with the client" />
    </>
  );
}
