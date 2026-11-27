import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { allHandouts, getAnyHandout } from "@/lib/library";
import { ClientHandoutView } from "@/components/client/client-handout-view";

/* Client mode (G3): one self-help skill sheet, plain language, crisis help on the page, no diagnosis labels. */
export const dynamicParams = false;

export function generateStaticParams() {
  return allHandouts.map((h) => ({ id: h.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return { title: getAnyHandout(id)?.title ?? "Skill" };
}

export default async function ClientSkillPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const handout = getAnyHandout(id);
  if (!handout) notFound();
  return <ClientHandoutView handout={handout} back={{ href: "/client/skills", label: "All skills" }} />;
}
