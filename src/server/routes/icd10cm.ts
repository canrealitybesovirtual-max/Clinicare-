/**
 * POST /api/icd10cm  body: { code } | { term, max? }  -> ICD-10-CM codes from the NLM Clinical Table Search Service.
 * Wire as: src/app/api/icd10cm/route.ts -> export { POST, runtime } from "@/server/routes/icd10cm";
 */
import { fail, ok, readBody } from "@/server/core";
import { ICD10CM_ATTRIBUTION, ICD10CM_SOURCE, Icd10cmInput, searchIcd10cm } from "@/server/integrations/nlm-icd10cm";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const input = await readBody(req, Icd10cmInput);
    return ok(await searchIcd10cm(input), ICD10CM_ATTRIBUTION, ICD10CM_SOURCE);
  } catch (e) {
    return fail(e);
  }
}
