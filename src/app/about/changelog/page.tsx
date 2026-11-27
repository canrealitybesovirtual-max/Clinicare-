import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, MessageSquareWarning } from "lucide-react";
import { PageIntro } from "@/components/content/content-meta";
import { Badge } from "@/components/ui/badge";
import { Disclosure } from "@/components/ui/disclosure";
import { findContentItem, type ContentItem } from "../report/content-items";
import { CHANGELOG, type ChangeKind, type ChangelogEntry } from "./entries";

export const metadata: Metadata = { title: "Content changelog" };

const KIND: Record<ChangeKind, { label: string; tone: "accent" | "info" | "warn" | "neutral" }> = {
  added: { label: "Added", tone: "accent" },
  changed: { label: "Changed", tone: "info" },
  corrected: { label: "Corrected", tone: "warn" },
  removed: { label: "Removed", tone: "neutral" },
};

const longDate = new Intl.DateTimeFormat("en-US", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

/** Entries grouped by date, newest first, keeping the recorded order within a day. */
function byDate(entries: readonly ChangelogEntry[]): [string, ChangelogEntry[]][] {
  const groups = new Map<string, ChangelogEntry[]>();
  for (const e of entries) groups.set(e.date, [...(groups.get(e.date) ?? []), e]);
  return [...groups.entries()].sort(([a], [b]) => b.localeCompare(a));
}

function ItemList({ items }: { items: readonly ContentItem[] }) {
  return (
    <ul className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
      {items.map((i) => (
        <li key={`${i.type}/${i.id}`} className="min-w-0">
          {i.href ? (
            <Link href={i.href} className="inline-flex min-h-11 items-center font-medium text-accent underline underline-offset-2">
              {i.title}
            </Link>
          ) : (
            <span className="inline-flex min-h-11 items-center">{i.title}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

/** What changed in the clinical content, newest first (static data in ./entries.ts). */
export default function ChangelogPage() {
  const days = byDate(CHANGELOG);
  return (
    // English-only page, like the rest of About (WCAG 3.1.2).
    <div className="space-y-10" lang="en">
      <PageIntro title="Content changelog" eyebrow="About">
        <p>
          What changed in the clinical content, newest first. New and changed items keep their own review status: until a
          licensed clinician signs off, each one says it is not yet clinically reviewed.
        </p>
        <p>
          <Link href="/about/report" className="inline-flex min-h-11 items-center gap-1.5 font-medium text-accent underline underline-offset-2">
            <MessageSquareWarning aria-hidden className="size-4" /> Report a content problem
          </Link>
        </p>
      </PageIntro>

      {days.map(([date, entries]) => (
        <section key={date} aria-labelledby={`day-${date}`} className="max-w-4xl">
          <h2 id={`day-${date}`} className="text-xl font-semibold">
            <time dateTime={date}>{longDate.format(new Date(`${date}T00:00:00Z`))}</time>
          </h2>
          <ol className="mt-4 space-y-4">
            {entries.map((e) => {
              const items = e.items.map(findContentItem).filter((i): i is ContentItem => i !== undefined);
              return (
                <li key={`${e.date}-${e.title}`} className="rounded-2xl border border-border bg-surface p-5 shadow-sm sm:p-6">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={KIND[e.kind].tone}>{KIND[e.kind].label}</Badge>
                    <h3 className="text-base font-semibold leading-snug">{e.title}</h3>
                  </div>
                  <p className="mt-2 max-w-reading text-sm leading-relaxed text-muted">{e.summary}</p>
                  {items.length ? (
                    <Disclosure title={`Show the ${items.length} items`} className="mt-3">
                      <ItemList items={items} />
                    </Disclosure>
                  ) : null}
                  {e.link ? (
                    <Link href={e.link.href} className="mt-3 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-accent underline underline-offset-2">
                      {e.link.label} <ArrowRight aria-hidden className="size-4" />
                    </Link>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}
