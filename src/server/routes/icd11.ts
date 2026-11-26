/**
 * POST /api/icd11  body: { code, lang? }  -> ICD-11 MMS title/definition from the WHO ICD-API.
 * When the API is not configured (503 "not-configured") or unavailable, the error body also carries
 * `fallbackUrl`: the WHO ICD-11 browser for the current release, for a plain link-out.
 * Wire as: src/app/api/icd11/route.ts -> export { POST, runtime } from "@/server/routes/icd11";
 */
import { NextResponse } from "next/server";
import { NotConfigured, UpstreamError, fail, ok, readBody } from "@/server/core";
import { ICD11_ATTRIBUTION, ICD11_SOURCE, Icd11Input, icd11BrowserLink, icd11Lookup } from "@/server/integrations/who-icd11";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let input: { code: string; lang: "en" | "es" } | undefined;
  try {
    input = await readBody(req, Icd11Input);
    return ok(await icd11Lookup(input), ICD11_ATTRIBUTION, ICD11_SOURCE);
  } catch (e) {
    const res = fail(e);
    if (!input || !(e instanceof NotConfigured || e instanceof UpstreamError)) return res;
    const body = (await res.json()) as Record<string, unknown>;
    return NextResponse.json({ ...body, fallbackUrl: icd11BrowserLink(input.code, input.lang) }, { status: res.status, headers: res.headers });
  }
}
