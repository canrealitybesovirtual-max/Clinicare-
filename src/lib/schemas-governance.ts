/**
 * Governance content contracts shared across content types (round 4).
 * - EvidenceGradeSchema: a structured, cited rating from a named guideline body. It records what that body said
 *   (direction + strength + year), never a ranking made by this app.
 * - LinkOutSchema: a curated outside resource, link out only (never re-hosted, G8). Defined in ./schemas so the
 *   core schemas can use it without an import cycle; re-exported here as the governance home.
 */
import { z } from "zod";
import { slug } from "./schemas";

export { LinkOutSchema, type LinkOut } from "./schemas";

export const EVIDENCE_BODIES = ["NICE", "VA/DoD", "APA", "APA Div 12", "WHO", "Cochrane", "USPSTF", "AASM", "SAMHSA", "other"] as const;

export const EvidenceGradeSchema = z.strictObject({
  body: z.enum(EVIDENCE_BODIES),
  guideline: z.string().min(5),
  year: z.number().int().min(1990),
  conditionId: slug.optional(),
  population: z.string().min(5).optional(),
  direction: z.enum(["for", "against", "insufficient"]),
  strength: z.string().min(2),
  url: z.url().refine((u) => u.startsWith("https://"), "https URLs only"),
});
export type EvidenceGrade = z.infer<typeof EvidenceGradeSchema>;

/** At most this many grades per intervention (neuromodulation-referral carries 4). */
export const MAX_EVIDENCE_GRADES = 6;
