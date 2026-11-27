import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { allHandouts, getAnyHandout } from "@/lib/library";
import { clientHandout } from "@/lib/client-safe";
import { ClientHandoutView } from "@/components/client/client-handout-view";
import { DiscreetBrowsingTips } from "@/components/layout/quick-exit";
import { DISCREET_HANDOUT_IDS, DISCREET_TITLE } from "@/lib/discreet";

/* Client mode (G3): one self-help skill sheet in English or Spanish, crisis help on the page, no diagnosis labels. */
export const dynamicParams = false;

export function generateStaticParams() {
  return allHandouts.map((h) => ({ id: h.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  // Safety pages get a neutral tab title (someone else may see the screen or the history).
  if (DISCREET_HANDOUT_IDS.includes(id)) return { title: { absolute: DISCREET_TITLE.en } };
  return { title: getAnyHandout(id)?.title ?? "Skill" };
}

export default async function ClientSkillPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const handout = getAnyHandout(id);
  if (!handout) notFound();
  return (
    <>
      {DISCREET_HANDOUT_IDS.includes(id) ? <DiscreetBrowsingTips className="mb-4" /> : null}
      <ClientHandoutView handout={clientHandout(handout)} back={{ href: "/client/skills", label: { en: "All skills", es: "Todos los ejercicios" } }} />
    </>
  );
}
