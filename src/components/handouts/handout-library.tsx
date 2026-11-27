"use client";
/**
 * Handouts library: on-device search and filters over curated handout cards. The search text goes through the PHI
 * scrubber (useScrubbedField), stays in this component's memory, and is never sent, stored or put in the URL.
 * Remounts on Clear session / idle wipe so the search and filters clear too.
 */
import * as React from "react";
import Link from "next/link";
import { ChevronRight, Clock, Search, X } from "lucide-react";
import { useSession } from "@/state/session";
import { useScrubbedField } from "@/components/symptoms/use-scrubbed-field";
import { PRIVATE_TEXT_FIELD_PROPS } from "@/components/ui/private-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { FilterOption, HandoutCardData } from "./catalog";

const selectClass =
  "mt-1.5 block min-h-11 w-full rounded-lg border border-input-border bg-surface px-3 text-base text-text sm:text-sm";

interface Props {
  cards: HandoutCardData[];
  practiceTypes: FilterOption[];
  interventions: FilterOption[];
}

export function HandoutLibrary(props: Props) {
  const { resetCount } = useSession();
  return <LibraryInner key={resetCount} {...props} />;
}

function matches(c: HandoutCardData, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return words.every((w) => c.searchText.includes(w));
}

function LibraryInner({ cards, practiceTypes, interventions }: Props) {
  const [query, setQuery] = React.useState("");
  const [practice, setPractice] = React.useState("");
  const [intervention, setIntervention] = React.useState("");
  const [logOnly, setLogOnly] = React.useState(false);
  const search = useScrubbedField<HTMLInputElement>(query, setQuery);
  const ids = { search: React.useId(), hint: React.useId(), practice: React.useId(), intervention: React.useId() };

  const results = React.useMemo(
    () =>
      cards.filter(
        (c) =>
          (!practice || c.practiceTypes.includes(practice)) &&
          (!intervention || c.interventionIds.includes(intervention)) &&
          (!logOnly || c.hasLog) &&
          matches(c, query),
      ),
    [cards, practice, intervention, logOnly, query],
  );
  const active = query !== "" || practice !== "" || intervention !== "" || logOnly;

  return (
    <div className="space-y-5">
      <section aria-labelledby="handout-filters">
        <Card className="space-y-4">
          <h2 id="handout-filters" className="text-lg font-semibold">
            Find a handout
          </h2>
          <div>
            <label htmlFor={ids.search} className="text-sm font-semibold">
              Search titles and topics
            </label>
            <p id={ids.hint} className="mt-0.5 text-xs text-muted">
              Search runs on this device only and is never saved or sent. Do not type client details.
            </p>
            <div className="relative mt-1.5">
              <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
              <input
                id={ids.search}
                ref={search.ref}
                type="search"
                aria-describedby={ids.hint}
                value={search.draft}
                onChange={(e) => search.setDraft(e.target.value)}
                onBlur={search.flushNow}
                {...PRIVATE_TEXT_FIELD_PROPS}
                placeholder="e.g., sleep, worry, breathing, urges"
                className="block min-h-11 w-full rounded-lg border border-input-border bg-surface pl-9 pr-3 text-base text-text placeholder:text-muted"
              />
            </div>
            <div role="alert">
              {search.removed ? (
                <p className="mt-2 text-sm font-medium text-warn-fg">
                  Possible identifier removed from the search ({search.removed.map((r) => r.label).join(", ")}).
                </p>
              ) : null}
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor={ids.practice} className="text-sm font-semibold">
                Practice type
              </label>
              <select id={ids.practice} className={selectClass} value={practice} onChange={(e) => setPractice(e.target.value)}>
                <option value="">All practice types</option>
                {practiceTypes.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label} ({o.count})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor={ids.intervention} className="text-sm font-semibold">
                Related intervention
              </label>
              <select id={ids.intervention} className={selectClass} value={intervention} onChange={(e) => setIntervention(e.target.value)}>
                <option value="">All interventions</option>
                {interventions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label} ({o.count})
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
            <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-sm">
              <input type="checkbox" className="size-5 accent-[var(--accent)]" checked={logOnly} onChange={(e) => setLogOnly(e.target.checked)} />
              Has a practice log to fill in
            </label>
            {active ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setPractice("");
                  setIntervention("");
                  setLogOnly(false);
                  search.replace("");
                  search.ref.current?.focus();
                }}
              >
                <X aria-hidden />
                Clear search and filters
              </Button>
            ) : null}
          </div>
        </Card>
      </section>

      <p aria-live="polite" className="text-sm font-semibold">
        {results.length === cards.length ? `${cards.length} handouts` : `${results.length} of ${cards.length} handouts`}
      </p>

      {results.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted">
          No handout matches. Clear the search or a filter.
        </p>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2" aria-label="Handouts">
          {results.map((c) => (
            <li key={c.id}>
              <article
                aria-labelledby={`card-${c.id}`}
                className="relative flex h-full flex-col rounded-xl border border-border bg-surface p-4 shadow-sm transition-colors hover:border-accent"
              >
                <h3 id={`card-${c.id}`} className="flex items-start gap-2 text-base font-semibold leading-snug">
                  {/* Stretched link: the whole card opens the handout (open, print or share). */}
                  <Link
                    href={`/handouts/${c.id}`}
                    className="min-w-0 flex-1 text-accent underline decoration-accent/40 underline-offset-2 after:absolute after:inset-0 after:rounded-xl hover:decoration-accent"
                  >
                    {c.title}
                  </Link>
                  <ChevronRight aria-hidden className="mt-0.5 size-4 shrink-0 text-muted" />
                </h3>
                <p className="mt-1.5 flex-1 text-sm leading-relaxed text-muted">{c.blurb}</p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <Badge tone="neutral">
                    <Clock aria-hidden className="size-3.5" /> {c.minutes} min
                  </Badge>
                  <Badge tone="neutral">Grades {c.readingLevel}</Badge>
                  {c.hasLog ? <Badge tone="accent">Practice log</Badge> : null}
                  {c.sud ? <Badge tone="warn">Part 2 notice on PDF</Badge> : null}
                  {c.reviewPending ? <Badge tone="warn">Not yet clinically reviewed</Badge> : null}
                </div>
                <p className="mt-2 text-xs text-muted">Open to print, download or share a link.</p>
              </article>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
