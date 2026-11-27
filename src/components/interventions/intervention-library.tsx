"use client";
import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ChevronRight, ClipboardCheck, GraduationCap, Search, SlidersHorizontal, X } from "lucide-react";
import { useSession } from "@/state/session";
import { ReviewBadge } from "@/components/content/content-meta";
import { useScrubbedField } from "@/components/symptoms/use-scrubbed-field";
import { PRIVATE_TEXT_FIELD_PROPS } from "@/components/ui/private-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { minutesLabel } from "./format";

export interface InterventionCardData {
  id: string;
  name: string;
  modality: string;
  orientations: string[];
  minutes: { min: number; max: number };
  conditions: { id: string; label: string }[];
  purpose: string;
  training: boolean;
  handoutCount: number;
  faith: boolean;
  reviewedBy: string;
}

export interface FilterOption {
  id: string;
  label: string;
  count: number;
}

type Training = "any" | "trained" | "not-trained";

interface Filters {
  orientation: string;
  condition: string;
  training: Training;
  handout: boolean;
  faith: boolean;
}

const NO_FILTERS: Filters = { orientation: "", condition: "", training: "any", handout: false, faith: false };

/** All search words must appear in the name, purpose or modality. Runs on this device only. */
function matchesQuery(item: InterventionCardData, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = `${item.name} ${item.purpose} ${item.modality}`.toLowerCase();
  return words.every((w) => hay.includes(w));
}

function applyFilters(items: readonly InterventionCardData[], f: Filters, query: string): InterventionCardData[] {
  return items.filter(
    (i) =>
      (!f.orientation || i.orientations.includes(f.orientation)) &&
      (!f.condition || i.conditions.some((c) => c.id === f.condition)) &&
      (f.training === "any" || (f.training === "trained" ? i.training : !i.training)) &&
      (!f.handout || i.handoutCount > 0) &&
      (!f.faith || i.faith) &&
      matchesQuery(i, query),
  );
}

const selectClass =
  "mt-1.5 block min-h-11 w-full rounded-lg border border-input-border bg-surface px-3 text-base text-text sm:text-sm";

/**
 * Reads ?condition=<id> (links from Possible diagnoses and the plan builder). Only an id from the curated condition
 * filter list is acted on; anything else is ignored.
 */
function ConditionParam({ onValue }: { onValue: (id: string) => void }) {
  const raw = useSearchParams().get("condition");
  React.useEffect(() => {
    if (raw) onValue(raw);
  }, [raw, onValue]);
  return null;
}

/** Interventions library: client-side filters and search. Search text is scrubbed and never leaves this component. */
export function InterventionLibrary(props: {
  items: InterventionCardData[];
  orientations: FilterOption[];
  conditions: FilterOption[];
}) {
  const { resetCount } = useSession();
  // Remount on Clear session / idle wipe so the search text and filters clear too.
  return <LibraryInner key={resetCount} {...props} />;
}

function LibraryInner({
  items,
  orientations,
  conditions,
}: {
  items: InterventionCardData[];
  orientations: FilterOption[];
  conditions: FilterOption[];
}) {
  const [query, setQuery] = React.useState("");
  const [filters, setFilters] = React.useState<Filters>(NO_FILTERS);
  // Phones: the filter selects fold behind a button so the results start higher. Always shown from sm.
  const [showFilters, setShowFilters] = React.useState(false);
  const search = useScrubbedField<HTMLInputElement>(query, setQuery);
  const results = React.useMemo(() => applyFilters(items, filters, query), [items, filters, query]);
  const filterCount =
    Number(Boolean(filters.orientation)) +
    Number(Boolean(filters.condition)) +
    Number(filters.training !== "any") +
    Number(filters.handout) +
    Number(filters.faith);
  const active = query !== "" || filterCount > 0;
  const pending = items.filter((i) => i.reviewedBy === "PENDING").length;
  const set = (patch: Partial<Filters>) => setFilters((f) => ({ ...f, ...patch }));
  const conditionIds = React.useMemo(() => new Set(conditions.map((c) => c.id)), [conditions]);
  const conditionFilter = conditions.find((c) => c.id === filters.condition);
  const resultsRef = React.useRef<HTMLHeadingElement>(null);
  const onConditionParam = React.useCallback(
    (id: string) => {
      if (conditionIds.has(id)) setFilters((f) => ({ ...f, condition: id }));
    },
    [conditionIds],
  );
  const clearAll = () => {
    setFilters(NO_FILTERS);
    search.replace("");
    // The clear buttons disappear once nothing is filtered: keep focus in the search box.
    search.ref.current?.focus();
  };
  const ids = {
    search: React.useId(),
    hint: React.useId(),
    orientation: React.useId(),
    condition: React.useId(),
    training: React.useId(),
    filters: React.useId(),
  };

  return (
    <div className="space-y-6">
      <React.Suspense fallback={null}>
        <ConditionParam onValue={onConditionParam} />
      </React.Suspense>
      <section aria-labelledby="filters-heading">
        <Card className="space-y-4">
          <h2 id="filters-heading" className="text-lg font-semibold">
            Find an intervention
          </h2>
          <div>
            <label htmlFor={ids.search} className="text-sm font-semibold">
              Search by name or purpose
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
                onBlur={search.onBlur}
                {...PRIVATE_TEXT_FIELD_PROPS}
                placeholder="e.g., breathing, worry, sleep, values"
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

          <Button
            type="button"
            variant="outline"
            className="w-full sm:hidden"
            aria-expanded={showFilters}
            aria-controls={ids.filters}
            onClick={() => setShowFilters((v) => !v)}
          >
            <SlidersHorizontal aria-hidden />
            {showFilters ? "Hide filters" : "Filters"}
            {filterCount > 0 ? <span className="font-normal text-muted">({filterCount} on)</span> : null}
          </Button>

          <div id={ids.filters} className={cn("space-y-4 sm:block", showFilters ? "block" : "hidden")}>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label htmlFor={ids.orientation} className="text-sm font-semibold">
                  Approach or orientation
                </label>
                <select id={ids.orientation} className={selectClass} value={filters.orientation} onChange={(e) => set({ orientation: e.target.value })}>
                  <option value="">All approaches</option>
                  {orientations.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label} ({o.count})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor={ids.condition} className="text-sm font-semibold">
                  Condition
                </label>
                <select id={ids.condition} className={selectClass} value={filters.condition} onChange={(e) => set({ condition: e.target.value })}>
                  <option value="">All conditions</option>
                  {conditions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label} ({c.count})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor={ids.training} className="text-sm font-semibold">
                  Training
                </label>
                <select
                  id={ids.training}
                  className={selectClass}
                  value={filters.training}
                  onChange={(e) => set({ training: e.target.value as Training })}
                >
                  <option value="any">Any</option>
                  <option value="trained">Trained clinicians only</option>
                  <option value="not-trained">No specialist training listed</option>
                </select>
              </div>
            </div>

            <fieldset className="flex flex-wrap items-center gap-x-6 gap-y-1">
              <legend className="sr-only">Show only interventions with</legend>
              <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-sm">
                <input type="checkbox" className="size-5 accent-[var(--accent)]" checked={filters.handout} onChange={(e) => set({ handout: e.target.checked })} />
                Has a client handout
              </label>
              <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-sm">
                <input type="checkbox" className="size-5 accent-[var(--accent)]" checked={filters.faith} onChange={(e) => set({ faith: e.target.checked })} />
                Has a faith-integrated variant
              </label>
              {active ? (
                <Button type="button" variant="ghost" size="sm" onClick={clearAll}>
                  <X aria-hidden />
                  Clear search and filters
                </Button>
              ) : null}
            </fieldset>
          </div>
        </Card>
      </section>

      <section aria-labelledby="results-heading" className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="results-heading" ref={resultsRef} tabIndex={-1} className="text-lg font-semibold outline-none">
            Results
          </h2>
          <p role="status" aria-live="polite" className="text-sm text-muted">
            Showing {results.length} of {items.length}
          </p>
        </div>
        {conditionFilter ? (
          <p className="flex flex-wrap items-center gap-x-2 text-sm">
            <span>
              For <strong>{conditionFilter.label}</strong>
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                set({ condition: "" });
                resultsRef.current?.focus();
              }}
            >
              <X aria-hidden />
              Show all conditions
            </Button>
          </p>
        ) : null}
        {pending > 0 ? (
          <p className="flex items-start gap-1.5 text-sm text-muted">
            <ClipboardCheck aria-hidden className="mt-0.5 size-4 shrink-0" />
            {pending === items.length
              ? `All ${items.length} interventions are awaiting licensed clinical review.`
              : `${pending} of ${items.length} interventions are awaiting licensed clinical review.`}
          </p>
        ) : null}
        {results.length ? (
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {results.map((i) => (
              <li key={i.id} className="min-w-0">
                <InterventionCard item={i} />
              </li>
            ))}
          </ul>
        ) : (
          <Card className="space-y-3 text-sm">
            <p className="font-semibold">No interventions match yet.</p>
            <p className="text-muted">Try fewer or different words (for example &ldquo;sleep&rdquo; or &ldquo;worry&rdquo;), or clear the filters.</p>
            <Button type="button" variant="outline" size="sm" onClick={clearAll}>
              <X aria-hidden />
              Clear search and filters
            </Button>
          </Card>
        )}
      </section>
    </div>
  );
}

function InterventionCard({ item }: { item: InterventionCardData }) {
  const shown = item.conditions.slice(0, 3);
  const extra = item.conditions.length - shown.length;
  return (
    <article
      aria-labelledby={`iv-${item.id}`}
      className="relative flex h-full flex-col rounded-xl border border-border bg-surface p-4 shadow-sm transition-colors hover:border-accent"
    >
      <h3 id={`iv-${item.id}`} className="flex items-start gap-2 text-base font-semibold leading-snug">
        {/* Stretched link: the whole card opens the detail page. */}
        <Link
          href={`/interventions/${item.id}`}
          className="min-w-0 flex-1 text-accent underline decoration-accent/40 underline-offset-2 after:absolute after:inset-0 after:rounded-xl hover:decoration-accent"
        >
          {item.name}
        </Link>
        <ChevronRight aria-hidden className="mt-0.5 size-4 shrink-0 text-muted" />
      </h3>
      <p className="mt-1 text-sm text-muted">{item.modality}</p>
      <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-text">{item.purpose}</p>
      {/* Text labels, not icons: 61 cards render on one page, so the list stays light and calm. */}
      <dl className="mt-auto space-y-0.5 pt-3 text-sm">
        <div>
          <dt className="inline text-muted">Time: </dt>
          <dd className="inline">{minutesLabel(item.minutes)}</dd>
        </div>
        <div>
          <dt className="inline text-muted">Used for: </dt>
          <dd className="inline">
            {shown.map((c) => c.label).join(", ")}
            {extra > 0 ? <span className="text-muted"> and {extra} more</span> : null}
          </dd>
        </div>
      </dl>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {item.training ? (
          <Badge tone="warn">
            <GraduationCap aria-hidden className="size-3.5" /> Trained clinicians only
          </Badge>
        ) : null}
        {item.handoutCount > 0 ? <Badge tone="accent">Client handout</Badge> : null}
        {item.faith ? <Badge tone="neutral">Faith-integrated option</Badge> : null}
        <ReviewBadge reviewedBy={item.reviewedBy} inList />
      </div>
    </article>
  );
}
