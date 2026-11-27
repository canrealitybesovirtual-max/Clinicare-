"use client";
import * as React from "react";
import Link from "next/link";
import { ArrowRight, Search, Wrench } from "lucide-react";
import { useSession } from "@/state/session";
import { ReviewBadge } from "@/components/content/content-meta";
import { useScrubbedField } from "@/components/symptoms/use-scrubbed-field";
import { Badge } from "@/components/ui/badge";
import { PRIVATE_TEXT_FIELD_PROPS } from "@/components/ui/private-field";

/** The slice of a guide the index needs (the full guide stays on the server). */
export interface PracticeCardData {
  id: string;
  title: string;
  summary: string;
  /** Extra words the search also looks in (when-to-use lines). */
  keywords: string;
  hasTool: boolean;
  reviewedBy: string;
}

export interface PracticeIndexGroup {
  category: string;
  label: string;
  line: string;
  items: PracticeCardData[];
}

/** Every search word must appear in the title, summary or when-to-use lines. Runs on this device only. */
export function matchesPracticeQuery(item: PracticeCardData, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = `${item.title} ${item.summary} ${item.keywords}`.toLowerCase();
  return words.every((w) => hay.includes(w));
}

function PracticeCard({ item }: { item: PracticeCardData }) {
  return (
    <Link
      href={`/practice/${item.id}`}
      className="group flex h-full min-h-11 flex-col rounded-2xl border border-border bg-surface p-4 shadow-sm transition-colors hover:border-accent sm:p-5"
    >
      <span className="flex items-start gap-1.5 text-base font-semibold leading-snug">
        <span className="min-w-0 flex-1">{item.title}</span>
        <ArrowRight aria-hidden className="mt-0.5 size-4 shrink-0 text-accent transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" />
      </span>
      <span className="mt-1.5 line-clamp-3 flex-1 text-sm leading-relaxed text-muted">{item.summary}</span>
      <span className="mt-3 flex flex-wrap gap-1.5">
        {item.hasTool ? (
          <Badge tone="accent">
            <Wrench aria-hidden className="size-3.5" /> Has a tool
          </Badge>
        ) : null}
        <ReviewBadge reviewedBy={item.reviewedBy} inList />
      </span>
    </Link>
  );
}

/** Practice guide index with an on-device search. The search text is scrubbed, kept in memory and never sent. */
export function PracticeIndex({ groups }: { groups: PracticeIndexGroup[] }) {
  const { resetCount } = useSession();
  // Remount on Clear session / idle wipe so the search text clears too.
  return <PracticeIndexInner key={resetCount} groups={groups} />;
}

function PracticeIndexInner({ groups }: { groups: PracticeIndexGroup[] }) {
  const [query, setQuery] = React.useState("");
  const search = useScrubbedField<HTMLInputElement>(query, setQuery);
  const searchId = React.useId();
  const hintId = React.useId();
  const shown = React.useMemo(
    () => groups.map((g) => ({ ...g, items: g.items.filter((i) => matchesPracticeQuery(i, query)) })).filter((g) => g.items.length > 0),
    [groups, query],
  );
  const total = groups.reduce((n, g) => n + g.items.length, 0);
  const count = shown.reduce((n, g) => n + g.items.length, 0);

  return (
    <div className="space-y-6">
      <div className="max-w-xl">
        <label htmlFor={searchId} className="text-sm font-semibold">
          Search the guides
        </label>
        <p id={hintId} className="mt-0.5 text-xs text-muted">
          Runs on this device only and is never saved or sent. Do not type client details.
        </p>
        <div className="relative mt-1.5">
          <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input
            id={searchId}
            ref={search.ref}
            type="search"
            aria-describedby={hintId}
            value={search.draft}
            onChange={(e) => search.setDraft(e.target.value)}
            onBlur={search.onBlur}
            {...PRIVATE_TEXT_FIELD_PROPS}
            placeholder="e.g., agenda, ending, group"
            className="block min-h-11 w-full rounded-xl border border-input-border bg-surface pl-9 pr-3 text-base text-text placeholder:text-muted"
          />
        </div>
        <div role="alert">
          {search.removed ? (
            <p className="mt-2 text-sm font-medium text-warn-fg">
              Possible identifier removed from the search ({search.removed.map((r) => r.label).join(", ")}).
            </p>
          ) : null}
        </div>
        <p role="status" className="mt-2 text-sm text-muted">
          {query ? `${count} of ${total} guides match.` : `${total} guides.`}
        </p>
      </div>

      {shown.length ? (
        shown.map((g) => (
          <section key={g.category} id={`category-${g.category}`} aria-labelledby={`category-${g.category}-heading`} className="scroll-mt-6">
            <h2 id={`category-${g.category}-heading`} className="text-lg font-semibold">
              {g.label}
            </h2>
            <p className="mb-3 text-sm text-muted">{g.line}</p>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {g.items.map((item) => (
                <li key={item.id}>
                  <PracticeCard item={item} />
                </li>
              ))}
            </ul>
          </section>
        ))
      ) : (
        <p className="rounded-xl border border-border bg-surface-2 p-4 text-sm">
          No guide matches that search. Try a shorter word, or{" "}
          <button
            type="button"
            onClick={() => {
              search.replace("");
              search.ref.current?.focus();
            }}
            className="inline-flex min-h-11 items-center font-semibold text-accent underline underline-offset-2"
          >
            clear the search
          </button>
          .
        </p>
      )}
    </div>
  );
}
