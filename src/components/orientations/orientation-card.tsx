import Link from "next/link";
import { ReviewBadge } from "@/components/content/content-meta";
import type { Orientation } from "@/lib/schemas-orientations";
import { EvidenceTierBadge, TrainingBadge } from "./orientation-badges";

/** Index card for one orientation profile. Server-safe; the whole title is the link (44px target). */
export function OrientationCard({ orientation: o, typicalCount }: { orientation: Orientation; typicalCount: number }) {
  const titleId = `orientation-${o.id}`;
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  return (
    <article
      aria-labelledby={titleId}
      className="flex h-full flex-col rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-5"
    >
      <h3 id={titleId} className="text-base font-semibold leading-snug">
        <Link
          href={`/orientations/${o.id}`}
          className="inline-flex min-h-11 items-center text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent"
        >
          {o.shortName}
        </Link>
      </h3>
      <p className="mt-1 flex-1 text-sm leading-relaxed text-muted">{o.summary}</p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <EvidenceTierBadge tier={o.evidenceTier} />
        <TrainingBadge orientation={o} />
        <ReviewBadge reviewedBy={o.reviewedBy} inList />
      </div>
      <p className="mt-2 text-xs text-muted">
        {typicalCount > 0 ? plural(typicalCount, "library technique") : "Overview and referral only"}
      </p>
    </article>
  );
}
