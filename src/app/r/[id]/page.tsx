import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { allHandouts, getAnyHandout } from "@/lib/library";
import { ClientHandoutView } from "@/components/client/client-handout-view";

/*
 * Public share page (spec section 3 screen 6, section 11): the link a clinician sends is /r/<handout id> and
 * carries nothing else. Client-facing (G3): plain language, crisis help, printable PDF; no diagnosis names, codes
 * or scores. Static: one page per library handout, unknown ids are a 404.
 */
export const dynamicParams = false;

export function generateStaticParams() {
  return allHandouts.map((h) => ({ id: h.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return { title: getAnyHandout(id)?.title ?? "Self-help sheet" };
}

export default async function SharedHandoutPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const handout = getAnyHandout(id);
  if (!handout) notFound();
  return <ClientHandoutView handout={handout} back={{ href: "/client", label: "More self-help and where to get help" }} />;
}
