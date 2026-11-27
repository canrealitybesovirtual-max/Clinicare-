import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Clock, GraduationCap, HeartHandshake, Send } from "lucide-react";
import { allHandouts, getAnyHandout } from "@/lib/library";
import { sharePath } from "@/lib/share";
import { PART2_NOTICE } from "@/lib/referral-links";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { Governance, PageIntro, ReviewBadge, SourcesList } from "@/components/content/content-bits";
import { DownloadPdfButton } from "@/components/pdf/download-pdf-button";
import { HandoutBody } from "@/components/handouts/handout-body";
import { ShareHandout } from "@/components/handouts/share-handout";
import { relatedInterventions } from "@/components/handouts/catalog";
import { HubPrompt } from "@/components/hub/hub-prompt";

export const dynamicParams = false;

export function generateStaticParams() {
  return allHandouts.map((h) => ({ id: h.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return { title: getAnyHandout(id)?.title ?? "Handout" };
}

export default async function HandoutPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const h = getAnyHandout(id);
  if (!h) notFound();
  const related = relatedInterventions(h.id);

  return (
    <>
      <Link href="/handouts" className="mb-3 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-accent">
        <ArrowLeft aria-hidden className="size-4" /> All handouts
      </Link>
      <PageIntro
        title={h.title}
        eyebrow="Client handout"
        badges={
          <>
            <Badge tone="neutral">
              <GraduationCap aria-hidden className="size-3.5" /> Reading level grades {h.readingLevel}
            </Badge>
            <Badge tone="neutral">
              <Clock aria-hidden className="size-3.5" /> About {h.estimatedMinutes} minutes
            </Badge>
            <ReviewBadge reviewedBy={h.reviewedBy} />
            {h.sud ? <Badge tone="warn">42 CFR Part 2 notice on the PDF</Badge> : null}
          </>
        }
      >
        <p>Original wording written for clients. Review it before you give it, and adapt the practice to the person.</p>
      </PageIntro>

      {h.sud ? (
        <div className="mb-6 max-w-3xl space-y-3">
          <HubPrompt context="sud" />
          <Notice tone="warn" title="Substance-use handout">
            <p>
              The PDF prints this notice in the footer of every page: {PART2_NOTICE} Nothing about the client is added to
              the PDF or the share link.
            </p>
          </Notice>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <article aria-labelledby="handout-body-heading" className="min-w-0">
          <Card className="space-y-5 sm:p-7">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 id="handout-body-heading" className="text-lg font-semibold">
                What the client will read
              </h2>
              <DownloadPdfButton handout={h} label="Download PDF" variant="primary" />
            </div>
            <HandoutBody handout={h} headingLevel="h3" />
            <div className="space-y-3 border-t border-border pt-4">
              <h3 className="text-sm font-semibold">Sources</h3>
              <SourcesList sources={h.sources} />
              <Governance license={h.license} lastVerified={h.lastVerified} reviewedBy={h.reviewedBy} />
            </div>
          </Card>
        </article>

        <div className="flex min-w-0 flex-col gap-6 lg:sticky lg:top-4">
          <section aria-labelledby="share-heading">
            <Card className="space-y-3">
              <h2 id="share-heading" className="flex items-center gap-2 text-lg font-semibold">
                <Send aria-hidden className="size-5 text-accent" /> Share with the client
              </h2>
              <ShareHandout path={sharePath(h.id)} title={h.title} />
              <p className="text-xs text-muted">
                The link opens a plain-language page with this handout, a printable PDF and crisis numbers. Send it only
                through a channel your practice approves.
              </p>
            </Card>
          </section>

          {related.length ? (
            <section aria-labelledby="related-heading">
              <Card className="space-y-3">
                <h2 id="related-heading" className="flex items-center gap-2 text-lg font-semibold">
                  <HeartHandshake aria-hidden className="size-5 text-muted" /> Used with
                </h2>
                <ul className="space-y-1 text-sm">
                  {related.map((i) => (
                    <li key={i.id}>
                      <Link
                        href={`/interventions/${i.id}`}
                        className="inline-flex min-h-11 items-center font-semibold text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent"
                      >
                        {i.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </Card>
            </section>
          ) : null}
        </div>
      </div>
    </>
  );
}
