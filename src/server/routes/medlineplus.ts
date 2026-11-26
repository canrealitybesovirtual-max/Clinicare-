/**
 * POST /api/medlineplus  body: { code, lang? }  -> MedlinePlus Connect pages for one ICD-10-CM code.
 * Wire as: src/app/api/medlineplus/route.ts -> export { POST, runtime } from "@/server/routes/medlineplus";
 */
import { fail, ok, readBody } from "@/server/core";
import {
  CONNECT_ATTRIBUTION,
  CONNECT_SOURCE,
  MedlinePlusConnectInput,
  medlinePlusByCode,
} from "@/server/integrations/medlineplus-connect";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const input = await readBody(req, MedlinePlusConnectInput);
    return ok(await medlinePlusByCode(input), CONNECT_ATTRIBUTION, CONNECT_SOURCE);
  } catch (e) {
    return fail(e);
  }
}
