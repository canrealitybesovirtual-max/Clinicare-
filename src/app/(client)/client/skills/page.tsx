import type { Metadata } from "next";
import { allHandouts } from "@/lib/library";
import { clipText, handoutTitle } from "@/components/handouts/localize";
import { ClientSkillsView, type SkillCard } from "@/components/client/client-skills-view";

export const metadata: Metadata = { title: "Skills" };

/* Client mode (G3): every app-authored client handout, plain titles only, English or Spanish. */
export default function ClientSkillsPage() {
  const skills: SkillCard[] = allHandouts.map((h) => ({
    id: h.id,
    title: handoutTitle(h),
    intro: { en: clipText(h.intro, 140), es: h.es ? clipText(h.es.intro, 140) : undefined },
    minutes: h.estimatedMinutes,
    hasLog: Boolean(h.practiceLog),
  }));
  return <ClientSkillsView skills={skills} />;
}
