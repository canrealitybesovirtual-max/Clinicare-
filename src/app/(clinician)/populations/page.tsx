import type { Metadata } from "next";
import Link from "next/link";
import { ListTree } from "lucide-react";
import { populations, populationsByGroup } from "@/lib/populations";
import { NextStep, PageIntro } from "@/components/content/content-meta";
import { PopulationCard } from "@/components/populations/population-card";
import { Disclosure } from "@/components/ui/disclosure";
import { HelpTip } from "@/components/ui/help-tip";
import { Notice } from "@/components/ui/notice";

export const metadata: Metadata = { title: "Population adaptations" };

const linkClass = "font-semibold text-accent underline underline-offset-2";

/**
 * Population adaptation profiles grouped in a fixed order, A to Z within a group. Reference for clinicians on adapting
 * assessment, sessions and interventions; nothing here asks for or saves anything about a client.
 */
export default function PopulationsPage() {
  const groups = populationsByGroup();
  return (
    <div className="mx-auto max-w-5xl">
      <PageIntro title="Population adaptations" eyebrow="Adapting care to people and contexts" compact>
        <p>
          {populations.length} profiles on adapting assessment, sessions and interventions for adults who share a context,
          such as a life stage, culture, disability, kind of work or circumstance. For clinician review: each profile
          offers questions to explore with the person, not assumptions about a group.
        </p>
      </PageIntro>

      <Notice tone="accent" title="Ask, do not assume" className="mb-5">
        <p>
          People differ more within any group than between groups. Use a profile only when the person tells you it is
          relevant, and let them correct you. The app never asks for or saves identity, status, diagnosis or group
          membership.
        </p>
      </Notice>

      <HelpTip title="What each profile covers" className="mb-5">
        <p>
          Questions to explore together, why the adaptation matters (with the evidence and its year), key considerations,
          changes to assessment and sessions, notes on adapting specific{" "}
          <Link href="/interventions" className={linkClass}>
            interventions
          </Link>
          , cautions about measures, safety notes next to the crisis resources, referrals and community resources, legal
          and ethics topics, and sources.
        </p>
        <p>
          Measures other than the built-in GAD-7 and PHQ-9 are link-outs only. Profiles that touch on substance use show
          the 42 CFR Part 2 notice.
        </p>
      </HelpTip>

      <nav aria-label="Population groups" className="mb-6">
        <Disclosure
          title={`Jump to a group (${groups.length})`}
          icon={ListTree}
          bordered={false}
          className="rounded-xl border border-border bg-surface px-4"
        >
          <ul className="flex flex-wrap gap-1.5">
            {groups.map((g) => (
              <li key={g.group}>
                <a
                  href={`#group-${g.group}`}
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
          <section key={g.group} id={`group-${g.group}`} aria-labelledby={`group-${g.group}-heading`} className="scroll-mt-6">
            <h2 id={`group-${g.group}-heading`} className="text-lg font-semibold">
              {g.label}
            </h2>
            <p className="mb-3 text-sm text-muted">{g.line}</p>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {g.items.map((p) => (
                <li key={p.id}>
                  <PopulationCard population={p} />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <NextStep href="/practice" label="Practice guides" />
    </div>
  );
}
