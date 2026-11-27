import { ExternalLink } from "@/components/ui/external-link";
import type { EvidenceGrade } from "@/lib/schemas-governance";

const DIRECTION: Record<EvidenceGrade["direction"], string> = {
  for: "Recommends or suggests",
  against: "Recommends or suggests against",
  insufficient: "Not enough evidence to recommend for or against",
};

/**
 * Structured guideline ratings for one intervention (body, guideline, year, direction, strength, population).
 * Each row reports what that body said, with a link to it; the app does not rank or combine them. Server-safe.
 */
export function EvidenceGrades({ grades, conditionLabel }: { grades: readonly EvidenceGrade[]; conditionLabel?: (id: string) => string }) {
  if (!grades.length) return null;
  return (
    <div className="space-y-2">
      <h3 className="text-base font-semibold">Guideline ratings</h3>
      <p className="text-xs text-muted">What each named body said, in its own year. Check the linked page for the current wording.</p>
      <ul className="space-y-2 text-sm">
        {grades.map((g, i) => (
          <li key={`${g.body}-${g.year}-${i}`} className="rounded-xl border border-border px-3 py-2">
            <p className="font-semibold">
              {g.body} ({g.year}): {DIRECTION[g.direction]}
            </p>
            <p className="text-muted">
              Strength: {g.strength}
              {g.conditionId && conditionLabel ? ` · For: ${conditionLabel(g.conditionId)}` : null}
              {g.population ? ` · Population: ${g.population}` : null}
            </p>
            <ExternalLink href={g.url} className="inline-flex min-h-11 items-center">
              {g.guideline}
            </ExternalLink>
          </li>
        ))}
      </ul>
    </div>
  );
}
