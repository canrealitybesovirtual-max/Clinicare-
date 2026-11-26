/**
 * POST /api/gho  body: { indicator, country }  -> latest WHO Global Health Observatory values for one curated
 * indicator and one curated ISO3 country (or GLOBAL / a WHO region code). The attribution names the data year (G13).
 * When WHO is unavailable or rate-limited, the error body also carries `fallbackUrl`: the WHO indicator page.
 * Wire as: src/app/api/gho/route.ts -> export { POST, runtime } from "@/server/routes/gho";
 */
import { NextResponse } from "next/server";
import { NotConfigured, UpstreamError, fail, ok, readBody } from "@/server/core";
import { GhoInput, getGhoIndicator, ghoIndicatorLink } from "@/server/integrations/who-gho";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let indicator: string | undefined;
  try {
    const input = await readBody(req, GhoInput);
    indicator = input.indicator;
    const result = await getGhoIndicator(input);
    return ok(result, result.attribution, result.sourceUrl);
  } catch (e) {
    const res = fail(e);
    if (!indicator || !(e instanceof NotConfigured || e instanceof UpstreamError)) return res;
    const body = (await res.json()) as Record<string, unknown>;
    return NextResponse.json({ ...body, fallbackUrl: ghoIndicatorLink(indicator) }, { status: res.status, headers: res.headers });
  }
}
