/**
 * Complementary & integrative options (guardrail G4): only practices with research evidence, each with its NCCIH
 * evidence pages and a link to the full entry in the interventions library. Server component.
 */
import Link from "next/link";
import { ArrowRight, Leaf } from "lucide-react";
import type { Intervention } from "@/lib/schemas-phase2";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ExternalLink } from "@/components/ui/external-link";
import { ReviewBadge } from "@/components/content/content-bits";

/** Library ids shown in this section, in display order. */
export const COMPLEMENTARY_IDS = ["physical-activity", "yoga-mind-body", "mindfulness-meditation", "sleep-hygiene-education"] as const;

export const COMPLEMENTARY_LABELS: Record<(typeof COMPLEMENTARY_IDS)[number], string> = {
  "physical-activity": "Exercise and physical activity",
  "yoga-mind-body": "Yoga and mind-body movement",
  "mindfulness-meditation": "Mindfulness and meditation",
  "sleep-hygiene-education": "Sleep habits",
};

const NCCIH = /NCCIH|National Center for Complementary and Integrative Health/i;

const ABBREVIATION = /\b(?:et al|e\.g|i\.e|vs|approx|cf|no)\.$/i;

/** First sentences of the evidence summary (the library entry has the full text). Skips "et al." and similar. */
export function evidenceLead(text: string, sentences = 2): string {
  const out: string[] = [];
  const boundary = /[.!?](?=\s+[A-Z0-9(])/g;
  let start = 0;
  for (let m = boundary.exec(text); m && out.length < sentences; m = boundary.exec(text)) {
    const end = m.index + 1;
    const candidate = text.slice(start, end);
    if (ABBREVIATION.test(candidate)) continue;
    out.push(candidate.trim());
    start = end;
  }
  if (out.length < sentences && start < text.length) out.push(text.slice(start).trim());
  return out.filter(Boolean).join(" ");
}

export function ComplementaryOptions({ items }: { items: { id: (typeof COMPLEMENTARY_IDS)[number]; intervention: Intervention }[] }) {
  return (
    <ul className="grid gap-4 md:grid-cols-2">
      {items.map(({ id, intervention: i }) => {
        const nccih = i.sources.filter((s) => NCCIH.test(s.publisher)).slice(0, 3);
        return (
          <li key={id}>
            <Card className="flex h-full flex-col gap-3">
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge tone="accent">
                  <Leaf aria-hidden className="size-3.5" />
                  Complementary &amp; integrative
                </Badge>
                <ReviewBadge reviewedBy={i.reviewedBy} />
              </div>
              <h3 className="text-base font-semibold leading-snug">{COMPLEMENTARY_LABELS[id]}</h3>
              <p className="text-sm leading-relaxed">
                <span className="font-semibold">Evidence: </span>
                {evidenceLead(i.evidenceLevel)}
              </p>
              {nccih.length ? (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted">NCCIH evidence notes</p>
                  <ul className="mt-1 space-y-0.5 text-sm">
                    {nccih.map((s) => (
                      <li key={s.url}>
                        <ExternalLink href={s.url} className="inline-flex min-h-11 items-center">
                          {s.title}
                        </ExternalLink>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <p className="mt-auto border-t border-border pt-2">
                <Link
                  href={`/interventions/${id}`}
                  className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent"
                >
                  {i.name}: steps, cautions and sources
                  <ArrowRight aria-hidden className="size-4" />
                </Link>
              </p>
            </Card>
          </li>
        );
      })}
    </ul>
  );
}
