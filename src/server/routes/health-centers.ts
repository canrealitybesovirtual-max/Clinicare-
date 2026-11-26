/**
 * POST /api/health-centers -> HRSA health center sites (src/server/integrations/hrsa.ts).
 * Body: { location: { zip } | { city, state }, radiusMiles?, limit? }. Needs HRSA_API_KEY; otherwise 503
 * "not-configured" and the UI shows healthCenterLink() from @/lib/referral-links. Bodies are never logged.
 */
import { fail, ok, readBody } from "@/server/core";
import { HRSA_ATTRIBUTION, HRSA_SOURCE_URL, HealthCentersInput, searchHealthCenters } from "@/server/integrations/hrsa";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const input = await readBody(req, HealthCentersInput);
    return ok(await searchHealthCenters(input), HRSA_ATTRIBUTION, HRSA_SOURCE_URL);
  } catch (e) {
    return fail(e);
  }
}
