/**
 * POST /api/pubmed  body: { queryId, max? }  -> PubMed evidence links for one curated search strategy.
 * When PubMed is unavailable or rate-limited, the error body also carries `fallbackUrl`: the same curated
 * strategy on pubmed.ncbi.nlm.nih.gov, for a plain link-out.
 * Wire as: src/app/api/pubmed/route.ts -> export { POST, runtime } from "@/server/routes/pubmed";
 */
import { NextResponse } from "next/server";
import { NotConfigured, UpstreamError, fail, ok, readBody } from "@/server/core";
import { PUBMED_ATTRIBUTION, PUBMED_SOURCE, PubmedInput, pubmedSearchLink, searchPubmed } from "@/server/integrations/pubmed";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let queryId: string | undefined;
  try {
    const input = await readBody(req, PubmedInput);
    queryId = input.queryId;
    return ok(await searchPubmed(input), PUBMED_ATTRIBUTION, PUBMED_SOURCE);
  } catch (e) {
    const res = fail(e);
    if (!queryId || !(e instanceof NotConfigured || e instanceof UpstreamError)) return res;
    const body = (await res.json()) as Record<string, unknown>;
    return NextResponse.json({ ...body, fallbackUrl: pubmedSearchLink(queryId) }, { status: res.status, headers: res.headers });
  }
}
