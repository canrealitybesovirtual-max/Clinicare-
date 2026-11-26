/**
 * Contract for content/topics.json (curated MedlinePlus psychoeducation keywords), isomorphic so the
 * CI content validator (scripts/validate-content.ts) can check the file without importing server-only
 * code. Mirrors HealthTopicsFileSchema in src/server/integrations/medlineplus-topics.ts: keep the two
 * in sync (the server module may later re-export this one).
 */
import { z } from "zod";
import { governance, slug } from "./schemas";

const MEDLINEPLUS_HOSTS = ["medlineplus.gov"] as const;

/** Same rule as the server's safeHttpsUrl(): https, no credentials or port, an allowed host. */
function medlinePlusPage(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return false;
  }
  if (u.protocol !== "https:" || u.username || u.password || u.port) return false;
  const host = u.hostname.toLowerCase();
  return MEDLINEPLUS_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}

const keyword = z
  .string()
  .min(2)
  .max(60)
  .regex(/^[\p{L}][\p{L} '-]*$/u, "plain keyword");
const pageUrl = z.url().refine(medlinePlusPage, "MedlinePlus https URL");

export const HealthTopicSchema = z.object({
  id: slug,
  en: keyword,
  es: keyword,
  clientLabel: z.string().min(3).max(80),
  clientLabelEs: z.string().min(3).max(80),
  sud: z.boolean().default(false),
  crisis: z.boolean().default(false),
  pages: z.object({ en: pageUrl, es: pageUrl }),
});
export type HealthTopic = z.infer<typeof HealthTopicSchema>;

export const HealthTopicsFileSchema = z
  .object({
    version: z.string(),
    description: z.string().optional(),
    topics: z.array(HealthTopicSchema).min(20),
    ...governance,
  })
  .superRefine((file, ctx) => {
    const seen = new Set<string>();
    for (const t of file.topics) {
      for (const k of [`id:${t.id}`, `en:${t.en.toLowerCase()}`, `es:${t.es.toLowerCase()}`]) {
        if (seen.has(k)) ctx.addIssue({ code: "custom", message: `duplicate topic ${k}` });
        seen.add(k);
      }
    }
  });
