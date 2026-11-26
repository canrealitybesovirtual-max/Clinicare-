/**
 * POST /api/providers -> CMS NPPES NPI Registry search (src/server/integrations/nppes.ts).
 * Body: { providerType, location: { zip } | { city, state }, limit?, skip? }. Bodies are never logged.
 */
import { fail, ok, readBody } from "@/server/core";
import { NPPES_ATTRIBUTION, NPPES_SOURCE_URL, ProvidersInput, searchProviders } from "@/server/integrations/nppes";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const input = await readBody(req, ProvidersInput);
    return ok(await searchProviders(input), NPPES_ATTRIBUTION, NPPES_SOURCE_URL);
  } catch (e) {
    return fail(e);
  }
}
