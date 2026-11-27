import * as React from "react";
import Link from "next/link";
import { ArrowRight, BookOpen, ClipboardCheck } from "lucide-react";
import type { Source, Stat } from "@/lib/schemas";
import { isStatStale } from "@/lib/content";
import { Badge } from "@/components/ui/badge";
import { ExternalLink } from "@/components/ui/external-link";
import { cn } from "@/lib/utils";

/**
 * G10: visible badge while a licensed clinician has not signed off on the item. `inList` keeps it visible but
 * neutral in list views (owner decision), so real warnings such as "Trained clinicians only" stand out there;
 * detail pages keep the warning tone.
 */
export function ReviewBadge({ reviewedBy, inList = false, className }: { reviewedBy: string; inList?: boolean; className?: string }) {
  if (reviewedBy === "PENDING") {
    return (
      <Badge tone={inList ? "neutral" : "warn"} className={className}>
        <ClipboardCheck aria-hidden className="size-3.5" />
        Not yet clinically reviewed
      </Badge>
    );
  }
  return (
    <Badge tone="accent" className={className}>
      <ClipboardCheck aria-hidden className="size-3.5" />
      Reviewed by {reviewedBy}
    </Badge>
  );
}

export function ClinicianReviewBadge({ className }: { className?: string }) {
  return (
    <Badge tone="info" className={cn("uppercase tracking-wide", className)}>
      For clinician review
    </Badge>
  );
}

/** Psychoeducation stat card (G13): value, original sentence, publisher + data year + link, stale flag. */
export function StatCard({ stat, compact = false, headingLevel = "h3" }: { stat: Stat; compact?: boolean; headingLevel?: "h2" | "h3" | "h4" }) {
  const stale = isStatStale(stat);
  const H = headingLevel;
  return (
    <article className={cn("flex h-full flex-col rounded-xl border border-border bg-surface p-4 shadow-sm", compact && "p-3.5 shadow-none")}>
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone="neutral">{stat.region === "US" ? "United States" : "Worldwide"}</Badge>
        {stale ? (
          <Badge tone="warn">Older data (over 5 years)</Badge>
        ) : null}
      </div>
      <H className={cn("mt-3 font-bold tracking-tight text-primary dark:text-text", compact ? "text-2xl" : "text-3xl")}>
        {stat.value}
      </H>
      <p className="mt-2 flex-1 text-sm leading-relaxed text-text">{stat.text}</p>
      <p className="mt-3 border-t border-border pt-3 text-xs leading-relaxed text-muted">
        <span className="font-semibold text-text">Source:</span> {stat.publisher}.{" "}
        <span className="font-semibold text-text">Data year:</span> {stat.dataYear}.{" "}
        <ExternalLink href={stat.url} className="text-xs">
          View source
        </ExternalLink>
      </p>
    </article>
  );
}

/** Named sources for a content item (title, publisher, year, link). */
export function SourcesList({ sources, className }: { sources: Source[]; className?: string }) {
  return (
    <ul className={cn("space-y-2 text-sm", className)}>
      {sources.map((s) => (
        <li key={s.url + s.title} className="flex items-start gap-2">
          <BookOpen aria-hidden className="mt-1 size-3.5 shrink-0 text-muted" />
          <span className="min-w-0">
            <ExternalLink href={s.url}>{s.title}</ExternalLink>
            <span className="text-muted">
              {" "}
              · {s.publisher}
              {s.year ? `, ${s.year}` : ""}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Governance footer for a content item: license, last verified, review status. */
export function Governance({
  license,
  lastVerified,
  reviewedBy,
  className,
}: {
  license: string;
  lastVerified: string;
  reviewedBy: string;
  className?: string;
}) {
  return (
    <dl className={cn("grid gap-x-4 gap-y-1 text-xs text-muted sm:grid-cols-[auto_1fr]", className)}>
      <dt className="font-semibold text-text">License</dt>
      <dd>{license === "original" ? "Original wording (app-authored)" : license}</dd>
      <dt className="font-semibold text-text">Last verified</dt>
      <dd>{lastVerified}</dd>
      <dt className="font-semibold text-text">Clinical review</dt>
      <dd>{reviewedBy === "PENDING" ? "Pending — not yet clinically reviewed" : reviewedBy}</dd>
    </dl>
  );
}

export function PageIntro({
  title,
  eyebrow,
  children,
  badges,
  compact = false,
}: {
  title: string;
  eyebrow?: string;
  children?: React.ReactNode;
  badges?: React.ReactNode;
  /** Tool pages: hide the description below sm so the tool starts higher on phones. */
  compact?: boolean;
}) {
  return (
    <div className={cn("max-w-3xl", compact ? "mb-4 sm:mb-6" : "mb-6")}>
      {eyebrow ? <p className="text-sm font-semibold uppercase tracking-wide text-accent">{eyebrow}</p> : null}
      <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
      {badges ? <div className="mt-3 flex flex-wrap gap-2">{badges}</div> : null}
      {children ? (
        <div className={cn("mt-3 space-y-2 text-base leading-relaxed text-muted", compact && "hidden sm:block")}>
          {children}
        </div>
      ) : null}
    </div>
  );
}

/** Consistent "Next: <step>" link at the end of a clinical-flow page. Curated paths only. */
export function NextStep({ href, label, className }: { href: string; label: string; className?: string }) {
  return (
    <p className={cn("mt-8", className)}>
      <Link
        href={href}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-lg font-semibold text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent"
      >
        Next: {label}
        <ArrowRight aria-hidden className="size-4" />
      </Link>
    </p>
  );
}
