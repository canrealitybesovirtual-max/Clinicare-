/**
 * POST /api/rxnorm  body: { drug }  -> RxCUI, brand names and drug classes for one curated medication (clinician mode).
 * Wire as: src/app/api/rxnorm/route.ts -> export { POST, runtime } from "@/server/routes/rxnorm";
 */
import { fail, ok, readBody } from "@/server/core";
import { RXNORM_ATTRIBUTION, RXNORM_SOURCE, RxNormInput, lookupRxNorm } from "@/server/integrations/rxnorm";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const input = await readBody(req, RxNormInput);
    return ok(await lookupRxNorm(input), RXNORM_ATTRIBUTION, RXNORM_SOURCE);
  } catch (e) {
    return fail(e);
  }
}
