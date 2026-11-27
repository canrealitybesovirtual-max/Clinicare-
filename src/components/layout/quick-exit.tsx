"use client";
/**
 * Quick exit and discreet browsing for safety topics (relationship and sexual violence). A person at risk may be
 * reading on a phone or computer that someone else checks, so these pages get:
 * - QuickExitButton: clears the in-memory session and replaces this page with a neutral site, so Back does not
 *   return here. Mounting it also gives the tab a neutral title.
 * - DiscreetBrowsingTips: what history, shared links, QR codes and printouts can reveal.
 * Crisis help stays on screen (the crisis button is part of every page). Nothing prints by itself.
 * Based on safety-net guidance on technology safety (NNEDV Safety Net Project, techsafety.org).
 */
import * as React from "react";
import { DoorOpen } from "lucide-react";
import { useT, type Text } from "@/lib/i18n/core";
import { useSession } from "@/state/session";
import { Disclosure } from "@/components/ui/disclosure";
import { cn } from "@/lib/utils";

/** Neutral page that replaces this one. A general search page reveals nothing about what was being read. */
export const QUICK_EXIT_URL = "https://www.google.com/";

/** Tab title for discreet pages, also meant for their generateMetadata. */
export const DISCREET_TITLE: Required<Text> = { en: "Health information", es: "Información de salud" };

/** Pages that get the quick exit: the relationship-safety client topic and its help card, in each language. */
export const DISCREET_PATHS: readonly string[] = [
  "/client/topics/relationship-safety",
  "/client/skills/relationship-safety-help-card",
  "/r/relationship-safety-help-card",
  "/r/relationship-safety-help-card/es",
];

export function isDiscreetPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return DISCREET_PATHS.includes(path);
}

const COPY = {
  button: { en: "Quick exit", es: "Salida rápida" },
  buttonHint: {
    en: "Leaves this page for a neutral website and clears this session.",
    es: "Sale de esta página hacia un sitio neutral y borra esta sesión.",
  },
  tipsTitle: {
    en: "Is someone else able to check this phone or computer?",
    es: "¿Otra persona puede revisar este teléfono o computadora?",
  },
  tips: [
    {
      en: "Quick exit takes you to a search page, and Back will not bring this page up again.",
      es: "La salida rápida abre una página de búsqueda, y el botón Atrás no vuelve a mostrar esta página.",
    },
    {
      en: "Your browser history can still list this site. A private or incognito window does not keep it.",
      es: "El historial del navegador todavía puede mostrar este sitio. Una ventana privada o de incógnito no lo guarda.",
    },
    {
      en: "Deleting all of your history can also be noticed. You can delete only the pages from this site instead.",
      es: "Borrar todo el historial también se puede notar. Puede borrar solo las páginas de este sitio.",
    },
    {
      en: "Anyone who looks at your messages or photos can see a link or QR code to this page. Keep one only if that feels safe.",
      es: "Cualquier persona que revise sus mensajes o fotos puede ver un enlace o código QR de esta página. Guárdelo solo si le parece seguro.",
    },
    {
      en: "Nothing here prints by itself. Print only if it is safe for someone to find the paper.",
      es: "Aquí nada se imprime solo. Imprima solo si no hay peligro de que alguien encuentre el papel.",
    },
    {
      en: "If you are in danger now, call your local emergency number (911 in the US).",
      es: "Si está en peligro ahora, llame al número de emergencias de su país (911 en EE. UU.).",
    },
  ],
} satisfies Record<string, Text | readonly Text[]>;

/** Gives the tab a neutral title while a discreet page is open (a server title in the page metadata is better still). */
function useDiscreetTitle(title: string) {
  React.useEffect(() => {
    document.title = title;
  }, [title]);
}

export function QuickExitButton({ className }: { className?: string }) {
  const t = useT();
  const { reset } = useSession();
  const hintId = React.useId();
  useDiscreetTitle(t(DISCREET_TITLE));
  return (
    <>
      {/* A real link, so it still leaves without JavaScript; with it, replace() keeps this page out of Back. */}
      <a
        href={QUICK_EXIT_URL}
        rel="noreferrer"
        aria-describedby={hintId}
        onClick={(e) => {
          e.preventDefault();
          reset();
          window.location.replace(QUICK_EXIT_URL);
        }}
        className={cn(
          "no-print inline-flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-xl border-2 border-text bg-surface px-4 text-sm font-bold text-text hover:bg-surface-2",
          className,
        )}
      >
        <DoorOpen aria-hidden className="size-4" />
        {t(COPY.button)}
      </a>
      <span id={hintId} className="sr-only">
        {t(COPY.buttonHint)}
      </span>
    </>
  );
}

export function DiscreetBrowsingTips({ className }: { className?: string }) {
  const t = useT();
  return (
    <div className={cn("no-print rounded-2xl border border-border bg-surface-2 px-4 sm:px-5", className)}>
      <Disclosure title={t(COPY.tipsTitle)} bordered={false}>
        <ul className="list-disc space-y-1.5 pl-5">
          {COPY.tips.map((tip) => (
            <li key={tip.en}>{t(tip)}</li>
          ))}
        </ul>
      </Disclosure>
    </div>
  );
}
