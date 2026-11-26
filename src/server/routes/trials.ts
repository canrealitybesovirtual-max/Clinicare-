/**
 * POST /api/trials  body: { condition, state? | country?, max? }  -> recruiting adult trials from ClinicalTrials.gov.
 * `condition` is a curated condition id or term; `state` a US state code; `country` a curated country name.
 * When the API is unavailable or rate-limited, the error body also carries `fallbackUrl`: the same search on
 * clinicaltrials.gov, for a plain link-out.
 * Wire as: src/app/api/trials/route.ts -> export { POST, runtime } from "@/server/routes/trials";
 */
import { NextResponse } from "next/server";
import { NotConfigured, UpstreamError, fail, ok, readBody } from "@/server/core";
import {
  TRIALS_ATTRIBUTION,
  TRIALS_SOURCE,
  TrialsInput,
  searchTrials,
  trialsSearchLink,
} from "@/server/integrations/clinicaltrials";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let input: TrialsInput | undefined;
  try {
    input = await readBody(req, TrialsInput);
    return ok(await searchTrials(input), TRIALS_ATTRIBUTION, TRIALS_SOURCE);
  } catch (e) {
    const res = fail(e);
    if (!input || !(e instanceof NotConfigured || e instanceof UpstreamError)) return res;
    const body = (await res.json()) as Record<string, unknown>;
    return NextResponse.json({ ...body, fallbackUrl: trialsSearchLink(input) }, { status: res.status, headers: res.headers });
  }
}
