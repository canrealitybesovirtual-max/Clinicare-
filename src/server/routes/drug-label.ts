/**
 * POST /api/drug-label  body: { drug }  -> current FDA label highlights (boxed warning, indications, warnings and
 * precautions, contraindications) for one curated medication, via openFDA (clinician mode; not for prescribing).
 * Wire as: src/app/api/drug-label/route.ts -> export { POST, runtime } from "@/server/routes/drug-label";
 */
import { fail, ok, readBody } from "@/server/core";
import { DRUG_LABEL_ATTRIBUTION, DRUG_LABEL_SOURCE, DrugLabelInput, lookupDrugLabel } from "@/server/integrations/openfda";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const input = await readBody(req, DrugLabelInput);
    return ok(await lookupDrugLabel(input), DRUG_LABEL_ATTRIBUTION, DRUG_LABEL_SOURCE);
  } catch (e) {
    return fail(e);
  }
}
