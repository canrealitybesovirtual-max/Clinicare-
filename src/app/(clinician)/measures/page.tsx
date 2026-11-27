import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ClipboardList } from "lucide-react";
import { conditions, measures } from "@/lib/content";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ExternalLink } from "@/components/ui/external-link";
import { PageIntro, ReviewBadge } from "@/components/content/content-bits";
import { DownloadPdfButton } from "@/components/pdf/download-pdf-button";
import { AdultOnly } from "@/components/measures/adult-only";
import { MeasurementBasedCareNote } from "@/components/measures/measure-form";
import { HubPrompt } from "@/components/hub/hub-prompt";

export const metadata: Metadata = { title: "Measures" };

export default function MeasuresPage() {
  // Link-out measures named in the knowledge base (license pending, G7), deduplicated by URL.
  const pending = new Map<string, { name: string; url: string; note: string; conditions: string[] }>();
  for (const c of conditions) {
    for (const m of c.measuresPending) {
      const prev = pending.get(m.url);
      if (prev) prev.conditions.push(c.name);
      else pending.set(m.url, { ...m, conditions: [c.name] });
    }
  }

  return (
    <>
      <PageIntro title="Measures" eyebrow="Step 3 · Clinician mode">
        <p>
          Built-in measures are limited to those with a confirmed license. Answers stay in this tab and scores are never
          saved — record results in your EHR. Completed forms can be exported as FHIR JSON with no identifiers.
        </p>
      </PageIntro>
      <div className="mb-6 max-w-3xl space-y-3">
        <MeasurementBasedCareNote />
        <HubPrompt context="assessment" />
      </div>

      <AdultOnly>
        <section aria-labelledby="builtin-heading">
          <h2 id="builtin-heading" className="sr-only">
            Built-in measures
          </h2>
          <ul className="grid gap-4 md:grid-cols-2">
            {measures.map((m) => (
              <li key={m.id}>
                <Card className="flex h-full flex-col gap-3">
                  <div className="flex items-start gap-3">
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
                      <ClipboardList aria-hidden className="size-5" />
                    </span>
                    <div className="min-w-0">
                      <h3 className="text-lg font-semibold leading-snug">{m.shortName}</h3>
                      <p className="text-sm text-muted">{m.name}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge tone="accent">License confirmed</Badge>
                    <Badge tone="neutral">{m.items.length} items</Badge>
                    <Badge tone="neutral">
                      Range {m.scoring.min}–{m.scoring.max}
                    </Badge>
                    {m.riskItems.length ? (
                      <Badge tone="crisis">Risk item {m.riskItems.map((r) => r.itemId).join(", ")}</Badge>
                    ) : null}
                    <ReviewBadge reviewedBy={m.reviewedBy} />
                  </div>
                  <p className="text-sm text-muted">
                    Bands: {m.scoring.bands.map((b) => `${b.label} ${b.min}–${b.max}`).join(" · ")}
                  </p>
                  <p className="text-xs text-muted">{m.citation}</p>
                  {m.loinc ? (
                    <p className="text-xs text-muted">
                      LOINC panel <span className="font-mono">{m.loinc.panel}</span>
                      {m.loinc.total ? (
                        <>
                          {" "}
                          · total score <span className="font-mono">{m.loinc.total}</span>
                        </>
                      ) : null}
                    </p>
                  ) : null}
                  <div className="mt-auto flex flex-wrap gap-2 pt-1">
                    <Link href={`/measures/${m.id}`} className={buttonVariants({ variant: "primary" })}>
                      Run {m.shortName}
                      <ArrowRight aria-hidden />
                    </Link>
                    <DownloadPdfButton measure={m} label="Blank PDF" />
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="pending-heading" className="mt-10">
          <h2 id="pending-heading" className="text-lg font-semibold">
            License pending — link out only
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-muted">
            These instruments are referenced by the knowledge base but are not built in until their terms are confirmed
            in writing. Links open the publisher or literature page.
          </p>
          <ul className="mt-4 grid gap-3 md:grid-cols-2">
            {[...pending.values()].map((p) => (
              <li key={p.url} className="rounded-xl border border-border bg-surface p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <ExternalLink href={p.url}>{p.name}</ExternalLink>
                  <Badge tone="warn">License pending</Badge>
                </div>
                <p className="mt-1.5 text-sm text-muted">{p.note}</p>
                <p className="mt-1 text-xs text-muted">Referenced for: {p.conditions.join(", ")}</p>
              </li>
            ))}
          </ul>
        </section>
      </AdultOnly>
    </>
  );
}
