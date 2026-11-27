"use client";
import Link from "next/link";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { useT, type Text } from "@/lib/i18n/core";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { POSITIONING } from "@/components/content/positioning";

const T = {
  eyebrow: { en: "For licensed mental-health professionals", es: "Para profesionales de salud mental con licencia" },
  title: {
    en: "From symptoms to resources, with the reasoning in view",
    es: "De los síntomas a los recursos, con el razonamiento a la vista",
  },
  /** G14 positioning statement; the English text is the canonical one in components/content/positioning.ts. */
  positioning: {
    en: POSITIONING,
    es: "Esta es una herramienta de referencia y recursos para profesionales de salud mental con licencia. No diagnostica, no reemplaza el juicio clínico ni la licencia profesional y no es un dispositivo médico. El profesional clínico con licencia debe revisar cada sugerencia de forma independiente.",
  },
  privacy: {
    en: "Nothing you type is stored. Lookups send only codes, curated terms, drug names or a ZIP or city.",
    es: "Nada de lo que escribe se guarda. Las búsquedas solo envían códigos, términos seleccionados, nombres de medicamentos o un código postal o ciudad.",
  },
  start: { en: "Start with symptoms", es: "Empezar con síntomas" },
} satisfies Record<string, Text>;

/** Home intro: what the app is (G14), what leaves the device, and one primary action, all above the fold on phones. */
export function HomeHero() {
  const t = useT();
  return (
    <section aria-labelledby="home-title" className="max-w-3xl">
      <p className="text-sm font-semibold uppercase tracking-wide text-accent">{t(T.eyebrow)}</p>
      <h1 id="home-title" className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
        {t(T.title)}
      </h1>
      <p className="mt-4 max-w-reading text-text sm:text-lg">{t(T.positioning)}</p>
      <p className="mt-3 flex max-w-reading items-start gap-2 text-sm text-muted">
        <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-accent" />
        {t(T.privacy)}
      </p>
      <Link href="/symptoms" className={cn(buttonVariants({ variant: "primary", size: "lg" }), "mt-6")}>
        {t(T.start)}
        <ArrowRight aria-hidden />
      </Link>
    </section>
  );
}
