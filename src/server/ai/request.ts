import "server-only";
/**
 * Request-body reader for POST /api/assistant. Same refusals as readBody() in src/server/core.ts (cross-site 403,
 * declared length 413, non-JSON 415, streamed byte cap 413), with a larger cap: the assistant input carries up to
 * 1500 characters of text plus curated ids, which does not fit core's 2 KB limit. The per-client limit is the
 * assistant's own stricter one (src/server/ai/limits.ts). Bodies are never logged.
 */
import { z } from "zod";
import { RequestRejected } from "@/server/core";

export const ASSISTANT_MAX_BODY_BYTES = 16_384;

async function readCapped(req: Request): Promise<string> {
  if (!req.body) return "";
  const reader = req.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > ASSISTANT_MAX_BODY_BYTES) {
      await reader.cancel().catch(() => undefined);
      throw new RequestRejected(413, "Request too large");
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

/** Raw JSON (unvalidated); the assistant validates it with its strict schema. */
export async function readAssistantJson(req: Request): Promise<unknown> {
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") throw new RequestRejected(403, "Cross-site requests are not accepted");
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (Number.isFinite(declared) && declared > ASSISTANT_MAX_BODY_BYTES) throw new RequestRejected(413, "Request too large");
  const type = req.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
  if (type !== "application/json") throw new RequestRejected(415, "Send JSON (Content-Type: application/json)");
  const text = await readCapped(req);
  try {
    return JSON.parse(text || "{}") as unknown;
  } catch {
    throw new z.ZodError([{ code: "custom", message: "invalid JSON", path: [], input: undefined }]);
  }
}
