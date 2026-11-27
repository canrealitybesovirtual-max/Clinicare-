import type { Metadata } from "next";
import Link from "next/link";
import { ListTree } from "lucide-react";
import { practiceByCategory } from "@/lib/practice";
import { NextStep, PageIntro } from "@/components/content/content-meta";
import { PracticeIndex, type PracticeIndexGroup } from "@/components/practice/practice-index";
import { Disclosure } from "@/components/ui/disclosure";
import { HelpTip } from "@/components/ui/help-tip";

export const metadata: Metadata = { title: "Practice guides" };

const linkClass = "font-semibold text-accent underline underline-offset-2";

/**
 * Practice guides grouped by category in a fixed order, A to Z within a category. Reference for clinicians on how
 * to run the clinical process; nothing here is about a particular client, and nothing is saved.
 */
export default function PracticeGuidesPage() {
  const groups: PracticeIndexGroup[] = practiceByCategory().map((g) => ({
    category: g.category,
    label: g.label,
    line: g.line,
    items: g.items.map((p) => ({
      id: p.id,
      title: p.title,
      summary: p.summary,
      keywords: p.whenToUse.join(" "),
      hasTool: p.toolHref !== undefined,
      reviewedBy: p.reviewedBy,
    })),
  }));

  return (
    <div className="mx-auto max-w-5xl">
      <PageIntro title="Practice guides" eyebrow="How to run the clinical process" compact>
        <p>
          Step-by-step guides to the work around any therapy: the alliance, session structure, goals and measurement,
          formats, interpreters, endings, safety and care coordination. For clinician review: each guide supports your own
          judgment and training, with example wording written for this app and the evidence behind it.
        </p>
      </PageIntro>

      <HelpTip title="How to use these guides" className="mb-5">
        <p>
          Each guide has when to use it, the steps, example wording, cautions, adaptations, the evidence and its sources.
          Example wording is original to this app: adapt it to your own voice and to the person in front of you.
        </p>
        <p>
          Guides about safety always show the crisis resources and never produce a risk score or level. Guides that touch on
          substance use show the 42 CFR Part 2 notice. Some guides link to a{" "}
          <Link href="/tools" className={linkClass}>
            session tool
          </Link>{" "}
          that works in memory only.
        </p>
      </HelpTip>

      <nav aria-label="Guide categories" className="mb-6">
        <Disclosure
          title={`Jump to a category (${groups.length})`}
          icon={ListTree}
          bordered={false}
          className="rounded-xl border border-border bg-surface px-4"
        >
          <ul className="flex flex-wrap gap-1.5">
            {groups.map((g) => (
              <li key={g.category}>
                <a
                  href={`#category-${g.category}`}
                  className="inline-flex min-h-11 items-center rounded-full border border-border bg-surface px-3 text-sm font-medium text-text hover:border-accent hover:bg-surface-2"
                >
                  {g.label}
                </a>
              </li>
            ))}
          </ul>
        </Disclosure>
      </nav>

      <PracticeIndex groups={groups} />

      <NextStep href="/tools" label="Session tools" />
    </div>
  );
}
