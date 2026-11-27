"use client";
/**
 * Small show/hide filter for server-rendered lists (Ethics & Legal Hub, referral directories).
 *
 * The server renders every card (so #id anchors and no-JS reading always work) and computes, with the content
 * helpers (ethicsCodesFor, legalTopicsFor, referralsFor), which ids match each facet value. Only those id lists
 * reach the browser. This component keeps the chosen values in React memory (never in the URL or any storage)
 * and hides cards that do not match every chosen facet.
 *
 * Values are curated option ids (profession, country, service kind). Nothing typed is involved.
 */
import * as React from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ALL, matchesFacets, type FacetIndex, type FacetOption } from "./facet-index";


interface FacetCtx {
  values: Record<string, string>;
  setValue: (facet: string, value: string) => void;
  reset: () => void;
  isVisible: (group: string, id: string) => boolean;
  visibleCount: (group: string) => number;
  total: (group: string) => number;
  active: boolean;
}

const Ctx = React.createContext<FacetCtx | null>(null);

function useFacets(): FacetCtx {
  const ctx = React.useContext(Ctx);
  if (!ctx) throw new Error("Facet components must be used inside <FacetFilterProvider>");
  return ctx;
}

export function FacetFilterProvider({
  index,
  items,
  initial,
  children,
}: {
  index: FacetIndex;
  /** group -> every id rendered in that group (in display order). */
  items: Record<string, readonly string[]>;
  /** facet -> starting value (defaults to ALL). */
  initial?: Record<string, string>;
  children: React.ReactNode;
}) {
  const facetNames = React.useMemo(() => {
    const names = new Set<string>();
    for (const g of Object.values(index)) for (const f of Object.keys(g)) names.add(f);
    return [...names];
  }, [index]);
  const allValues = React.useMemo(() => Object.fromEntries(facetNames.map((f) => [f, ALL])), [facetNames]);
  const [values, setValues] = React.useState<Record<string, string>>(() => ({ ...allValues, ...initial }));
  const pendingScroll = React.useRef<string | null>(null);

  const isVisible = React.useCallback((group: string, id: string) => matchesFacets(index, group, id, values), [index, values]);

  // A link to a hidden card (#id) clears the filters so the card can be shown and scrolled to. Clicks are caught
  // too, because client-side links change the hash with pushState, which fires no hashchange event.
  React.useEffect(() => {
    const reveal = (rawId: string) => {
      let id = rawId;
      try {
        id = decodeURIComponent(rawId);
      } catch {
        /* keep the raw id */
      }
      if (!id) return;
      const group = Object.keys(items).find((g) => items[g]!.includes(id));
      if (!group || matchesFacets(index, group, id, values)) return;
      pendingScroll.current = id;
      setValues(allValues);
    };
    const onHash = () => reveal(window.location.hash.slice(1));
    const onClick = (e: MouseEvent) => {
      const target = e.target instanceof Element ? e.target.closest("a[href]") : null;
      if (!(target instanceof HTMLAnchorElement)) return;
      const url = new URL(target.href, window.location.href);
      if (url.origin === window.location.origin && url.pathname === window.location.pathname && url.hash.length > 1) {
        reveal(url.hash.slice(1));
      }
    };
    window.addEventListener("hashchange", onHash);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("hashchange", onHash);
      document.removeEventListener("click", onClick, true);
    };
  }, [allValues, index, items, values]);

  React.useEffect(() => {
    const id = pendingScroll.current;
    if (!id) return;
    pendingScroll.current = null;
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ block: "start" });
      if (el.tabIndex < 0 && !el.hasAttribute("tabindex")) el.setAttribute("tabindex", "-1");
      el.focus({ preventScroll: true });
    }
  }, [values]);

  const ctx = React.useMemo<FacetCtx>(
    () => ({
      values,
      setValue: (facet, value) => setValues((v) => ({ ...v, [facet]: value })),
      reset: () => setValues(allValues),
      isVisible,
      visibleCount: (group) => (items[group] ?? []).filter((id) => isVisible(group, id)).length,
      total: (group) => (items[group] ?? []).length,
      active: Object.values(values).some((v) => v && v !== ALL),
    }),
    [allValues, isVisible, items, values],
  );
  return <Ctx.Provider value={ctx}>{children}</Ctx.Provider>;
}

/** Native select bound to one facet (44px target, visible label). */
export function FacetSelect({
  facet,
  label,
  hint,
  options,
  className,
}: {
  facet: string;
  label: string;
  hint?: string;
  options: readonly FacetOption[];
  className?: string;
}) {
  const { values, setValue } = useFacets();
  const id = React.useId();
  const hintId = `${id}-hint`;
  return (
    <div className={cn("flex min-w-0 flex-col gap-1", className)}>
      <label htmlFor={id} className="text-sm font-semibold text-text">
        {label}
      </label>
      {hint ? (
        <p id={hintId} className="text-xs text-muted">
          {hint}
        </p>
      ) : null}
      <select
        id={id}
        value={values[facet] ?? ALL}
        aria-describedby={hint ? hintId : undefined}
        onChange={(e) => setValue(facet, e.target.value)}
        className="min-h-11 w-full min-w-0 rounded-lg border border-border bg-surface px-3 text-sm text-text"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Shows its server-rendered children only when the id (or any of `ids`) matches the chosen facets. */
export function FacetGate({
  group,
  id,
  ids,
  as = "div",
  className,
  children,
}: {
  group: string;
  id?: string;
  ids?: readonly string[];
  as?: "div" | "li" | "section";
  className?: string;
  children: React.ReactNode;
}) {
  const { isVisible } = useFacets();
  const list = ids ?? (id ? [id] : []);
  const visible = list.some((x) => isVisible(group, x));
  const Tag = as;
  return (
    <Tag hidden={!visible} className={className}>
      {children}
    </Tag>
  );
}

/** Polite live count: "Showing 7 of 22 codes". */
export function FacetCount({
  group,
  singular,
  plural,
  className,
}: {
  group: string;
  singular: string;
  plural: string;
  className?: string;
}) {
  const { visibleCount, total } = useFacets();
  const n = visibleCount(group);
  const t = total(group);
  return (
    <p role="status" aria-live="polite" className={cn("text-sm text-muted", className)}>
      Showing {n} of {t} {t === 1 ? singular : plural}
    </p>
  );
}

/** Children shown only when nothing in the group matches. */
export function FacetEmpty({ group, children }: { group: string; children: React.ReactNode }) {
  const { visibleCount } = useFacets();
  return visibleCount(group) === 0 ? <>{children}</> : null;
}

/** "Show all" button, enabled only while a filter is active. */
export function FacetReset({ label = "Show all", className }: { label?: string; className?: string }) {
  const { active, reset } = useFacets();
  return (
    <Button type="button" variant="outline" className={className} onClick={reset} disabled={!active}>
      <RotateCcw aria-hidden />
      {label}
    </Button>
  );
}
