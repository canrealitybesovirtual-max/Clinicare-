"use client";
/**
 * Local search and category filter over the curated medication list (clinician mode). Runs on this device only:
 * nothing typed is sent anywhere, and the search box goes through the PHI scrubber like every free-text field.
 */
import * as React from "react";
import Link from "next/link";
import { ChevronRight, Search, ShieldAlert } from "lucide-react";
import type { MedicationCategory } from "@/lib/schemas-medications";
import { useSession } from "@/state/session";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PRIVATE_TEXT_FIELD_PROPS } from "@/components/ui/private-field";
import { useScrubbedField } from "@/components/symptoms/use-scrubbed-field";
import { deaLabel, matchesMedication, type MedicationListItem } from "./medication-labels";

interface Props {
  items: MedicationListItem[];
  categories: { id: MedicationCategory; label: string }[];
}

export function MedicationBrowser(props: Props) {
  const { resetCount } = useSession();
  return <MedicationBrowserInner key={resetCount} {...props} />;
}

function MedicationBrowserInner({ items, categories }: Props) {
  const [query, setQuery] = React.useState("");
  const search = useScrubbedField<HTMLInputElement>(query, setQuery);
  const [category, setCategory] = React.useState<MedicationCategory | "all">("all");
  const ids = React.useId();

  // Filter on the scrubbed value only (PHI scrubber before any processing, G5).
  const term = query;
  const visible = React.useMemo(
    () => items.filter((m) => (category === "all" || m.category === category) && matchesMedication(m, term)),
    [items, category, term],
  );
  const groups = categories
    .map((c) => ({ ...c, meds: visible.filter((m) => m.category === c.id) }))
    .filter((g) => g.meds.length > 0);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 rounded-xl border border-border bg-surface p-4 shadow-sm md:grid-cols-[minmax(0,1fr)_minmax(0,18rem)] md:items-start">
        <div>
          <label htmlFor={`${ids}-q`} className="text-sm font-semibold">
            Search by generic or brand name
          </label>
          <div className="relative mt-1.5">
            <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <input
              id={`${ids}-q`}
              ref={search.ref}
              type="search"
              value={search.draft}
              onChange={(e) => search.setDraft(e.target.value)}
              onBlur={search.flushNow}
              {...PRIVATE_TEXT_FIELD_PROPS}
              placeholder="e.g., sertraline, Zoloft, SSRI"
              aria-describedby={`${ids}-hint`}
              className="block min-h-11 w-full rounded-lg border border-border bg-surface pl-9 pr-3 text-base text-text placeholder:text-muted/80"
            />
          </div>
          <p id={`${ids}-hint`} className="mt-1 text-xs text-muted">
            Searches this list on your device only. Nothing typed is sent.
          </p>
          <div role="alert">
            {search.removed ? (
              <p className="mt-2 text-sm font-medium text-warn-fg">
                Possible identifier removed from the search ({search.removed.map((r) => r.label).join(", ")}).
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${ids}-cat`} className="text-sm font-semibold">
            Category
          </label>
          <select
            id={`${ids}-cat`}
            value={category}
            onChange={(e) => setCategory(e.target.value as MedicationCategory | "all")}
            className="min-h-11 w-full rounded-lg border border-border bg-surface px-3 text-base text-text sm:text-sm"
          >
            <option value="all">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 md:col-span-2">
          <p role="status" aria-live="polite" className="text-sm text-muted">
            Showing {visible.length} of {items.length} medications
          </p>
          {term || category !== "all" ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="min-h-11"
              onClick={() => {
                search.replace("");
                setCategory("all");
              }}
            >
              Clear filters
            </Button>
          ) : null}
        </div>
      </div>

      {groups.length === 0 ? (
        <p className="rounded-xl border border-border bg-surface-2 p-4 text-sm">
          No medication in this list matches. Try the generic name, a brand name or the drug class, or search DailyMed
          from any medication page.
        </p>
      ) : (
        groups.map((g) => (
          <section key={g.id} aria-labelledby={`${ids}-${g.id}`}>
            <h2 id={`${ids}-${g.id}`} className="mb-3 text-lg font-semibold">
              {g.label} <span className="text-sm font-normal text-muted">({g.meds.length})</span>
            </h2>
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {g.meds.map((m) => (
                <li key={m.id}>
                  <Link
                    href={`/medications/${m.id}`}
                    className="flex min-h-11 items-start gap-2 rounded-xl border border-border bg-surface p-3 shadow-sm hover:bg-surface-2"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold text-text">{m.name}</span>
                      <span className="block text-sm text-muted">
                        {m.className}
                        {m.brands.length ? ` · ${m.brands.slice(0, 3).join(", ")}` : ""}
                      </span>
                      {m.boxedWarning || m.deaSchedule || m.sud ? (
                        <span className="mt-1.5 flex flex-wrap gap-1">
                          {m.boxedWarning ? (
                            <Badge tone="warn">
                              <ShieldAlert aria-hidden className="size-3.5" />
                              Boxed warning
                            </Badge>
                          ) : null}
                          {m.deaSchedule ? <Badge tone="neutral">{deaLabel(m.deaSchedule)}</Badge> : null}
                          {m.sud ? <Badge tone="info">SUD treatment use</Badge> : null}
                        </span>
                      ) : null}
                    </span>
                    <ChevronRight aria-hidden className="mt-0.5 size-4 shrink-0 text-muted" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
