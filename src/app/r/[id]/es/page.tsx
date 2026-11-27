import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { allHandouts, getAnyHandout } from "@/lib/library";
import { clientHandout } from "@/lib/client-safe";
import { clientMetadata } from "@/components/client/client-metadata";
import { ClientHandoutView } from "@/components/client/client-handout-view";
import { SHARE_BACK } from "../share-back";
import { DiscreetBrowsingTips } from "@/components/layout/quick-exit";
import { DISCREET_HANDOUT_IDS, DISCREET_TITLE } from "@/lib/discreet";

/*
 * Spanish share page /r/<handout id>/es: the same client-facing page as /r/<id>, opened in Spanish. Only handouts
 * with a Spanish translation have this page; any other id is a 404. The path carries the handout id and the
 * language code, nothing else (G5).
 */
export const dynamicParams = false;

export function generateStaticParams() {
  return allHandouts.filter((h) => h.es).map((h) => ({ id: h.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const h = getAnyHandout(id);
  const es = clientMetadata("es");
  if (DISCREET_HANDOUT_IDS.includes(id)) return { ...es, title: { absolute: DISCREET_TITLE.es } };
  return { ...es, title: { absolute: `${h?.es?.title ?? h?.title ?? "Hoja de autoayuda"} · Autoayuda` } };
}

export default async function SharedHandoutPageEs({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const handout = getAnyHandout(id);
  if (!handout?.es) notFound();
  return (
    <>
      {DISCREET_HANDOUT_IDS.includes(id) ? <DiscreetBrowsingTips className="mb-4" /> : null}
      <ClientHandoutView handout={clientHandout(handout)} back={SHARE_BACK} initialLang="es" />
    </>
  );
}
