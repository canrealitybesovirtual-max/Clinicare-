/**
 * POST /api/lactmed  body: { drug }  -> LactMed records (title and NCBI link) for one curated medication (clinician
 * mode, education only). When NCBI is unavailable or rate-limited, the error body also carries `fallbackUrl`: the
 * LactMed home page on NCBI, for a plain link-out.
 * Wire as: src/app/api/lactmed/route.ts -> export { POST, runtime } from "@/server/routes/lactmed";
 */
import { NextResponse } from "next/server";
import { NotConfigured, UpstreamError, fail, ok, readBody } from "@/server/core";
import { LACTMED_ATTRIBUTION, LACTMED_SOURCE, LactMedInput, lookupLactMed } from "@/server/integrations/lactmed";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const input = await readBody(req, LactMedInput);
    return ok(await lookupLactMed(input), LACTMED_ATTRIBUTION, LACTMED_SOURCE);
  } catch (e) {
    const res = fail(e);
    if (!(e instanceof NotConfigured || e instanceof UpstreamError)) return res;
    const body = (await res.json()) as Record<string, unknown>;
    return NextResponse.json({ ...body, fallbackUrl: LACTMED_SOURCE }, { status: res.status, headers: res.headers });
  }
}
