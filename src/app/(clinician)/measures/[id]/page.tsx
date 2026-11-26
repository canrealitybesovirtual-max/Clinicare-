import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getMeasure, licenses, measures } from "@/lib/content";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Governance, PageIntro, ReviewBadge, SourcesList } from "@/components/content/content-bits";
import { MeasureForm } from "@/components/measures/measure-form";
import { AdultOnly } from "@/components/measures/adult-only";

export const dynamicParams = false;

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
        <MeasureForm measure={measure} />
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
    </>
  );
}
