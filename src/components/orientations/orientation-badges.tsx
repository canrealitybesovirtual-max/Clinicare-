/**
 * Badges for orientation profiles. Server-safe. Every evidence tier uses the same neutral tone, so the badges
 * describe the research base without ranking one school of therapy above another.
 */
import { FlaskConical, GraduationCap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EVIDENCE_TIER_LABELS, type EvidenceTier, type Orientation } from "@/lib/schemas-orientations";

export function EvidenceTierBadge({ tier, className }: { tier: EvidenceTier; className?: string }) {
  return (
    <Badge tone="neutral" className={className}>
      <FlaskConical aria-hidden className="size-3.5" />
      <span className="sr-only">Evidence: </span>
      {EVIDENCE_TIER_LABELS[tier].label}
    </Badge>
  );
}

/** "Trained clinicians only" when every model needs specific training; a quieter note when only some do. */
export function TrainingBadge({ orientation, className }: { orientation: Pick<Orientation, "trainingRequired" | "models">; className?: string }) {
  if (orientation.trainingRequired) {
    return (
      <Badge tone="warn" className={className}>
        <GraduationCap aria-hidden className="size-3.5" /> Trained clinicians only
      </Badge>
    );
  }
  if (orientation.models.some((m) => m.trainingRequired)) {
    return (
      <Badge tone="neutral" className={className}>
        <GraduationCap aria-hidden className="size-3.5" /> Some models need specific training
      </Badge>
    );
  }
  return null;
}
