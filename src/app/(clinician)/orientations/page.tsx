import type { Metadata } from "next";
import Link from "next/link";
import { ListTree } from "lucide-react";
import { orientationLinks, orientations, orientationsByFamily } from "@/lib/orientations";
import { EVIDENCE_TIERS, EVIDENCE_TIER_LABELS } from "@/lib/schemas-orientations";
import { NextStep, PageIntro } from "@/components/content/content-meta";
import { OrientationCard } from "@/components/orientations/orientation-card";
import { Disclosure } from "@/components/ui/disclosure";
import { HelpTip } from "@/components/ui/help-tip";

export const metadata: Metadata = { title: "Theoretical orientations" };

const linkClass = "font-semibold text-accent underline underline-offset-2";

/**
 * Orientation profiles grouped by family, in a fixed family order and A to Z within a family. Reference for
 * clinicians: nothing here ranks orientations or suggests one for a particular client.
 */
export default function OrientationsPage() {
  const groups = orientationsByFamily();
  return (
    <div className="mx-auto max-w-5xl">
      <PageIntro title="Theoretical orientations" eyebrow="How each school of therapy works" compact>
        <p>
          {orientations.length} profiles of psychotherapy orientations: how each understands problems and change, the
          therapist&apos;s stance, a typical session, its techniques in the library and the evidence for its main models.
          For clinician review: reference to support your own judgment and training. The app does not rank orientations
          or choose one for a client.
        </p>
      </PageIntro>

      <HelpTip title="How to read these profiles" className="mb-5">
        <p>
          Profiles are grouped by family. The evidence badge on a card shows the best-supported model in that profile;
          open the profile to see the evidence for each model. Evidence tiers describe research, not how well an approach
          fits a particular person: choose with the client, within your training.
        </p>
        <ul className="list-disc space-y-1 pl-5">
          {EVIDENCE_TIERS.map((t) => (
            <li key={t}>
              <strong>{EVIDENCE_TIER_LABELS[t].label}:</strong> {EVIDENCE_TIER_LABELS[t].meaning}
            </li>
          ))}
        </ul>
        <p>
          <strong>Trained clinicians only</strong> marks profiles whose models all need specific training; those pages are
          overviews with links to the training body. Each technique links to its page in the{" "}
          <Link href="/interventions" className={linkClass}>
            Interventions
          </Link>{" "}
          library, with steps, cautions and sources.
        </p>
      </HelpTip>

      <nav aria-label="Orientation families" className="mb-6">
        <Disclosure
          title={`Jump to a family (${groups.length})`}
          icon={ListTree}
          bordered={false}
          className="rounded-xl border border-border bg-surface px-4"
        >
          <ul className="flex flex-wrap gap-1.5">
            {groups.map((g) => (
              <li key={g.family}>
                <a
                  href={`#family-${g.family}`}
                  className="inline-flex min-h-11 items-center rounded-full border border-border bg-surface px-3 text-sm font-medium text-text hover:border-accent hover:bg-surface-2"
                >
                  {g.label}
                </a>
              </li>
            ))}
          </ul>
        </Disclosure>
      </nav>

      <div className="space-y-8">
        {groups.map((g) => (
          <section key={g.family} id={`family-${g.family}`} aria-labelledby={`family-${g.family}-heading`} className="scroll-mt-6">
            <h2 id={`family-${g.family}-heading`} className="mb-3 text-lg font-semibold">
              {g.label}
            </h2>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {g.items.map((o) => (
                <li key={o.id}>
                  <OrientationCard orientation={o} typicalCount={orientationLinks(o).typical.length} />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <NextStep href="/formulations" label="Case formulations" />
    </div>
  );
}
