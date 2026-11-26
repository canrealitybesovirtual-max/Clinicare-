/**
 * POST /api/health-topics  body: { topic, lang?, max? }  -> MedlinePlus health topics for one curated keyword.
 * Wire as: src/app/api/health-topics/route.ts -> export { POST, runtime } from "@/server/routes/health-topics";
 */
import { fail, ok, readBody } from "@/server/core";
import {
  HEALTH_TOPICS_ATTRIBUTION,
  HEALTH_TOPICS_SOURCE,
  HealthTopicsInput,
  searchHealthTopics,
} from "@/server/integrations/medlineplus-topics";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const input = await readBody(req, HealthTopicsInput);
    return ok(await searchHealthTopics(input), HEALTH_TOPICS_ATTRIBUTION, HEALTH_TOPICS_SOURCE[input.lang]);
  } catch (e) {
    return fail(e);
  }
}
