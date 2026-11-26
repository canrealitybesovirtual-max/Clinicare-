/**
 * POST /api/treatment-facilities -> SAMHSA FindTreatment.gov (src/server/integrations/findtreatment.ts).
 * Body: { location: { zip } | { city, state }, facilityType: "mental-health" | "substance-use" | "both",
 * radiusMiles?, page?, pageSize? }. Nothing else is accepted (42 CFR Part 2). Needs
 * FINDTREATMENT_ACCESS_APPROVED=true; otherwise 503 "not-configured" and the UI shows findTreatmentLink().
 */
import { fail, ok, readBody } from "@/server/core";
import {
  FINDTREATMENT_ATTRIBUTION,
  FINDTREATMENT_SOURCE_URL,
  TreatmentFacilitiesInput,
  searchTreatmentFacilities,
} from "@/server/integrations/findtreatment";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const input = await readBody(req, TreatmentFacilitiesInput);
    return ok(await searchTreatmentFacilities(input), FINDTREATMENT_ATTRIBUTION, FINDTREATMENT_SOURCE_URL);
  } catch (e) {
    return fail(e);
  }
}
