import Link from "next/link";
import { Users } from "lucide-react";
import { ClinicianReviewBadge } from "@/components/content/content-meta";
import { Disclosure } from "@/components/ui/disclosure";
import { populationNotesFor, type AdaptationTargetRef } from "@/lib/populations";

/**
 * Population adaptation notes for one intervention or orientation, for /interventions/[id] and /orientations/[id].
 * Server component (reads content/populations). Renders nothing when no profile has a note for the target.
 * The notes are prompts to discuss with the person, never assumptions about a group.
 */
export function PopulationNotesPanel(props: AdaptationTargetRef) {
  const notes = populationNotesFor(props);
  if (!notes.length) return null;
  return (
    <section aria-label="Population adaptations" className="rounded-2xl border border-border bg-surface px-4 shadow-sm sm:px-5">
      <Disclosure title={`Adapting for specific populations (${notes.length})`} icon={Users} bordered={false}>
        <div className="space-y-3">
          <ClinicianReviewBadge />
          <p className="text-sm text-muted">Considerations to ask about with the person, not assumptions about a group.</p>
          <ul className="space-y-3">
            {notes.map(({ population, note }) => (
              <li key={population.id} className="text-sm leading-relaxed">
                <Link
                  href={`/populations/${population.id}`}
                  className="inline-flex min-h-11 items-center font-semibold text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent"
                >
                  {population.name}
                </Link>
                <p className="text-text">{note}</p>
              </li>
            ))}
          </ul>
        </div>
      </Disclosure>
    </section>
  );
}
