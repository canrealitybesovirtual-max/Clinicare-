import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ClipboardList } from "lucide-react";
import { conditions, licenses, measures } from "@/lib/content";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ExternalLink } from "@/components/ui/external-link";
import { NextStep, PageIntro, ReviewBadge } from "@/components/content/content-meta";
import { HelpTip } from "@/components/ui/help-tip";
import { DownloadPdfButton } from "@/components/pdf/download-pdf-button";
import { AdultOnly } from "@/components/measures/adult-only";
import { MeasurementBasedCareNote } from "@/components/measures/measure-form";
import { HubPrompt } from "@/components/hub/hub-prompt";

export const metadata: Metadata = { title: "Measures" };

/** Opening phrases in licenses.json terms that describe the terms rather than name the instrument. */
const NOT_A_NAME = /^(?:believed|check|copyrighted|not built|reported|who instrument)\b/i;

/** Display name for a license-queue key: its `name`, else the instrument name the terms open with, else the key. */
function queueName(key: string, l: { name?: string; terms: string }): string {
  if (l.name) return l.name;
  const lead = /^([^(.;:,]{2,80}?)\s*[(.;:,]/.exec(l.terms)?.[1]?.trim();
  if (!lead || NOT_A_NAME.test(lead) || lead === key) return key;
  return lead.includes(key) ? lead : `${lead} (${key})`;
}

/** Structured risk instruments need trained raters (G9): flagged in licenses.json, or by its "Trained clinicians only". */
function isRiskInstrument(l: { kind?: string; terms: string }): boolean {
  return l.kind === "risk-instrument" || /trained clinicians only/i.test(l.terms);
}

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
  // Every other measure in the license queue (content/licenses.json, status pending): name and source link only.
  const namedKeys = new Set(conditions.flatMap((c) => c.measuresPending.map((m) => m.licenseKey)));
  const queue = Object.entries(licenses.items)
    .filter(([key, l]) => l.status === "pending" && !namedKeys.has(key) && typeof l.source === "string" && l.source.startsWith("https://"))
    .map(([key, l]) => ({ key, name: queueName(key, l), url: l.source as string, risk: isRiskInstrument(l) }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <>
      <PageIntro title="Measures" eyebrow="Step 3 · Clinician mode" compact>
        <p>Short, license-confirmed screening measures. Answers stay in this tab and scores are never saved.</p>
      </PageIntro>
      <HelpTip title="How to use measures" className="mb-5">
        <p>
          Press Run to give a measure in session, or download a blank PDF for paper. The total and severity band appear as
          the client answers; a completed form can be exported as FHIR JSON with no identifiers for your record system.
        </p>
        <p>
          Only measures whose license is confirmed are built in. Others are listed below as links to the publisher.
          Repeat the same measure over time and use the trend tool to see change; record each score in your EHR.
        </p>
      </HelpTip>
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
                      // Informational only: crisis red is kept for crisis buttons and active red flags.
                      <Badge tone="info">Includes a risk item ({m.riskItems.map((r) => r.itemId).join(", ")})</Badge>
                    ) : null}
                    <ReviewBadge reviewedBy={m.reviewedBy} inList />
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
                {/* The badge already says "License pending"; show the note only when it adds something. */}
                {/license pending/i.test(p.note) ? null : <p className="mt-1.5 text-sm text-muted">{p.note}</p>}
                <p className="mt-1 text-xs text-muted">Referenced for: {p.conditions.join(", ")}</p>
              </li>
            ))}
          </ul>
          {queue.length ? (
            <>
              <h3 className="mt-6 text-base font-semibold">Other measures (license pending, link-out only)</h3>
              <p className="mt-1 max-w-3xl text-sm text-muted">
                Every other instrument in the app&apos;s license queue that no condition above names. Not built in; the
                link opens the publisher or literature page.
              </p>
              <ul className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-3">
                {queue.map((q) => (
                  <li key={q.key} className={q.risk ? "py-1" : undefined}>
                    <ExternalLink href={q.url} className="inline-flex min-h-11 items-center">
                      {q.name}
                    </ExternalLink>
                    {q.risk ? (
                      <span className="block text-xs text-muted">
                        Structured risk instrument: trained raters only. This app does not score it or decide risk.
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </section>
      </AdultOnly>
      <NextStep href="/plan" label="Step 4 · Plan with the client" />
    </>
  );
}
