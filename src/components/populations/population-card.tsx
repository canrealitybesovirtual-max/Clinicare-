import Link from "next/link";
import { ReviewBadge } from "@/components/content/content-meta";
import type { Population } from "@/lib/schemas-populations";

/** Index card for one population profile. Server-safe; the title is the link (44px target). */
export function PopulationCard({ population: p }: { population: Population }) {
  const titleId = `population-${p.id}`;
  return (
    <article aria-labelledby={titleId} className="flex h-full flex-col rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-5">
      <h3 id={titleId} className="text-base font-semibold leading-snug">
        <Link
          href={`/populations/${p.id}`}
          className="inline-flex min-h-11 items-center text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent"
        >
          {p.name}
        </Link>
      </h3>
      <p className="mt-1 line-clamp-4 flex-1 text-sm leading-relaxed text-muted">{p.summary}</p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <ReviewBadge reviewedBy={p.reviewedBy} inList />
      </div>
    </article>
  );
}
