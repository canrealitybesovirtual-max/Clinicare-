"use client";
import * as React from "react";
import { ChevronDown, LoaderCircle, RefreshCw, WifiOff, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "@/components/ui/external-link";
import { Notice } from "@/components/ui/notice";
import { cn } from "@/lib/utils";
import { lookupErrorCopy, type LookupState } from "./live-lookup";

/** Loading row with a skeleton block. */
export function LookupLoading({ what, className }: { what: string; className?: string }) {
  return (
    <div className={cn("space-y-2", className)}>
      <p className="flex items-center gap-2 text-sm text-muted">
        <LoaderCircle aria-hidden className="size-4 animate-spin" />
        Loading {what}…
      </p>
      <div aria-hidden className="h-12 animate-pulse rounded-lg bg-surface-2" />
    </div>
  );
}

/**
 * Error notice with retry (rate-limited, offline, upstream) and a link-out fallback. `fallback` is the caller's
 * official page; the route's own fallbackUrl (ICD-11 browser) wins when present.
 */
export function LookupError({
  state,
  onRetry,
  fallback,
  plain = false,
}: {
  state: Extract<LookupState<unknown>, { status: "error" }>;
  onRetry: () => void;
  fallback?: { href: string; label: string };
  plain?: boolean;
}) {
  const copy = lookupErrorCopy(state.code, state.message, plain);
  const link = state.fallbackUrl ? { href: state.fallbackUrl, label: fallback?.label ?? "Open the official browser" } : fallback;
  return (
    <Notice tone={state.code === "network" ? "neutral" : "warn"} icon={state.code === "network" ? WifiOff : undefined} title={copy.title}>
      <p>{copy.body}</p>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {copy.retry ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={(e) => {
              // This button unmounts while the retry loads: move focus to the panel first so it never drops to <body>.
              e.currentTarget.closest<HTMLElement>("[data-lookup-focus]")?.focus();
              onRetry();
            }}
          >
            <RefreshCw aria-hidden />
            Try again
          </Button>
        ) : null}
        {link ? (
          <ExternalLink href={link.href} className="inline-flex min-h-11 items-center">
            {link.label}
          </ExternalLink>
        ) : null}
      </div>
    </Notice>
  );
}

/**
 * One short polite status line per panel (WCAG 4.1.3), instead of a live region around the whole result list,
 * which would read every item, link and attribution on each update.
 */
export function LookupStatusLine({
  state,
  what,
  plain = false,
}: {
  state: LookupState<unknown>;
  what: (data: unknown) => string;
  plain?: boolean;
}) {
  const text =
    state.status === "loading"
      ? "Loading…"
      : state.status === "ok"
        ? what(state.data)
        : state.status === "error"
          ? lookupErrorCopy(state.code, state.message, plain).title
          : "";
  return (
    <p role="status" className="sr-only">
      {text}
    </p>
  );
}

/** Attribution line (always the string the route returned) with a link to the source. */
export function Attribution({ text, source, className }: { text: string; source?: string; className?: string }) {
  return (
    <p className={cn("text-xs text-muted", className)}>
      {text}
      {source && source.startsWith("https://") ? (
        <>
          {" "}
          ·{" "}
          <ExternalLink href={source} className="text-xs">
            About this source
          </ExternalLink>
        </>
      ) : null}
    </p>
  );
}

/**
 * Lazy panel: a disclosure button that mounts its children only once opened, so any lookup inside starts only
 * when the clinician asks for it. Children stay mounted after closing (results are kept, not refetched).
 */
export function LazyPanel({
  title,
  meta,
  icon: Icon,
  children,
}: {
  title: string;
  meta?: string;
  icon?: LucideIcon;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);
  const regionId = React.useId();
  return (
    <div className="border-t border-border">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={regionId}
        onClick={() => {
          setOpen((o) => !o);
          setMounted(true);
        }}
        className="flex min-h-12 w-full items-center gap-2 py-2 text-left text-sm font-semibold hover:text-accent"
      >
        {Icon ? <Icon aria-hidden className="size-4 shrink-0 text-muted" /> : null}
        <span className="flex-1">{title}</span>
        {meta ? <span className="text-xs font-normal text-muted">{meta}</span> : null}
        <ChevronDown aria-hidden className={cn("size-4 shrink-0 text-muted transition-transform", open && "rotate-180")} />
      </button>
      <div id={regionId} hidden={!open} className="space-y-3 pb-4 text-sm leading-relaxed">
        {mounted ? children : null}
      </div>
    </div>
  );
}
