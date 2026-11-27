import type { Metadata } from "next";
import { getAnyHandout } from "@/lib/library";
import { ClientHome } from "@/components/client/client-home";
import { groupClientTopics } from "@/components/client/topics";

export const metadata: Metadata = { title: "Self-help" };

/** The skill featured on the client home: short, calming, safe for most people, and it has a practice log. */
const FEATURED_SKILL = "pmr-homework";

/*
 * Client mode home (G3): plain language (grades 6-8), crisis information first, no diagnosis names, no codes,
 * no scores, and no links into clinician screens. English or Spanish (memory-only language choice).
 */
export default function ClientPage() {
  const { crisis, groups } = groupClientTopics();
  return <ClientHome crisis={crisis} groups={groups} featured={getAnyHandout(FEATURED_SKILL)} />;
}
