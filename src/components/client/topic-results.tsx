"use client";
/**
 * MedlinePlus Health Topics results for one client-mode topic (G3, G5, G17), in the page language (English or
 * Spanish; MedlinePlus has both).
 * - Only the curated topic id and a language code are sent to our /api/health-topics route.
 * - MedlinePlus titles and summaries can name a diagnosis, so each one passes the client-mode filter first; when a
 *   title is not plain-safe a neutral label is used, and an unsafe summary is not shown.
 * - Always shows the attribution string the route returns ("Information from MedlinePlus.gov").
 * - Offline, rate-limited or not configured: plain wording, a retry button where it helps, and the topic's curated
 *   MedlinePlus page as a plain link that needs no lookup (owner decision: client topics may link out to it).
 */
import { LoaderCircle, RefreshCw, WifiOff } from "lucide-react";
import type { HealthTopicsResult } from "@/server/integrations/medlineplus-topics";
import { pick, type Lang, type Text } from "@/lib/i18n/core";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "@/components/ui/external-link";
import { Notice } from "@/components/ui/notice";
import { useLookup, type LookupState } from "@/components/diagnoses/live-lookup";
import { Attribution } from "@/components/diagnoses/lookup-status";
import { firstClientSafe, isClientSafeText } from "@/lib/client-safe";
import type { ClientTopic } from "./topics";

const TEXT = {
  page: { en: "Open the MedlinePlus page for this topic", es: "Abrir la página de MedlinePlus sobre este tema" },
  more: { en: "More on MedlinePlus ({n})", es: "Más información en MedlinePlus ({n})" },
  none: { en: "No pages came back for this topic.", es: "No se encontraron páginas para este tema." },
  loading: { en: "Loading pages from MedlinePlus…", es: "Cargando páginas de MedlinePlus…" },
  loaded: { en: "{n} pages from MedlinePlus loaded", es: "Se cargaron {n} páginas de MedlinePlus" },
  group: { en: "Pages from MedlinePlus", es: "Páginas de MedlinePlus" },
  retry: { en: "Try again", es: "Intentar de nuevo" },
  offlineTitle: { en: "You seem to be offline", es: "Parece que no tiene conexión a internet" },
  offlineBody: { en: "Connect to the internet, then try again.", es: "Conéctese a internet y vuelva a intentarlo." },
  busyTitle: { en: "Too many people are looking right now", es: "Hay muchas personas buscando en este momento" },
  busyBody: { en: "Wait about 10 seconds, then try again.", es: "Espere unos 10 segundos y vuelva a intentarlo." },
  offTitle: { en: "This list is not available right now", es: "Esta lista no está disponible en este momento" },
  offBody: { en: "You can still open the page linked below.", es: "Aun así puede abrir la página del enlace de abajo." },
  failTitle: { en: "The health library did not answer", es: "La biblioteca de salud no respondió" },
  failBody: { en: "Try again in a moment.", es: "Vuelva a intentarlo en un momento." },
} satisfies Record<string, Text>;

type ErrorState = Extract<LookupState<unknown>, { status: "error" }>;

function errorCopy(code: ErrorState["code"]): { title: Text; body: Text; retry: boolean } {
  switch (code) {
    case "network":
      return { title: TEXT.offlineTitle, body: TEXT.offlineBody, retry: true };
    case "rate-limited":
      return { title: TEXT.busyTitle, body: TEXT.busyBody, retry: true };
    case "not-configured":
    case "invalid":
    case "rejected":
      return { title: TEXT.offTitle, body: TEXT.offBody, retry: false };
    default:
      return { title: TEXT.failTitle, body: TEXT.failBody, retry: true };
  }
}

const n = (template: string, value: number) => template.replace("{n}", String(value));

export function TopicResults({ topic, lang }: { topic: ClientTopic; lang: Lang }) {
  const { state, retry } = useLookup<HealthTopicsResult>("health-topics", { topic: topic.id, lang, max: 5 });
  const t = (text: Text) => pick(text, lang);
  const page = topic.pages[lang];

  const status =
    state.status === "loading" ? t(TEXT.loading) : state.status === "ok" ? n(t(TEXT.loaded), state.data.items.length) : state.status === "error" ? t(errorCopy(state.code).title) : "";

  return (
    <div className="space-y-4">
      <p role="status" className="sr-only">
        {status}
      </p>
      <div role="group" aria-label={t(TEXT.group)} aria-busy={state.status === "loading" || undefined} data-lookup-focus tabIndex={-1} className="rounded-lg">
        {state.status === "idle" || state.status === "loading" ? (
          <div className="space-y-2">
            <p className="flex items-center gap-2 text-sm text-muted">
              <LoaderCircle aria-hidden className="size-4 animate-spin motion-reduce:animate-none" />
              {t(TEXT.loading)}
            </p>
            <div aria-hidden className="h-12 animate-pulse rounded-xl bg-surface-2 motion-reduce:animate-none" />
          </div>
        ) : state.status === "error" ? (
          <ErrorNotice state={state} lang={lang} page={page} onRetry={retry} />
        ) : state.data.items.length === 0 ? (
          <div className="space-y-2">
            <p className="text-muted">{t(TEXT.none)}</p>
            <ExternalLink href={page} className="inline-flex min-h-11 items-center">
              {t(TEXT.page)}
            </ExternalLink>
          </div>
        ) : (
          <div className="space-y-4">
            <ul className="space-y-3">
              {state.data.items.map((item, i) => {
                const title = firstClientSafe([item.title, ...item.altTitles]) ?? n(t(TEXT.more), i + 1);
                const summary = item.summary && isClientSafeText(item.summary) ? item.summary : null;
                return (
                  <li key={item.url} className="rounded-xl border border-border bg-surface p-4">
                    <ExternalLink href={item.url} className="inline-flex min-h-11 items-center text-base">
                      {title}
                    </ExternalLink>
                    {summary ? <p className="mt-1 text-sm leading-relaxed text-muted">{summary}</p> : null}
                  </li>
                );
              })}
            </ul>
            <p className="text-sm">
              <ExternalLink href={page} className="inline-flex min-h-11 items-center">
                {t(TEXT.page)}
              </ExternalLink>
            </p>
            {/* The attribution string is shown exactly as the route returns it (English). */}
            <div lang="en">
              <Attribution text={state.attribution} source={state.source} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ErrorNotice({ state, lang, page, onRetry }: { state: ErrorState; lang: Lang; page: string; onRetry: () => void }) {
  const copy = errorCopy(state.code);
  const t = (text: Text) => pick(text, lang);
  return (
    <Notice tone="neutral" icon={state.code === "network" ? WifiOff : undefined} title={t(copy.title)}>
      <p>{t(copy.body)}</p>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {copy.retry ? (
          <Button
            type="button"
            variant="outline"
            onClick={(e) => {
              // This button unmounts while the retry loads: move focus to the panel first so it never drops to <body>.
              e.currentTarget.closest<HTMLElement>("[data-lookup-focus]")?.focus();
              onRetry();
            }}
          >
            <RefreshCw aria-hidden />
            {t(TEXT.retry)}
          </Button>
        ) : null}
        <ExternalLink href={page} className="inline-flex min-h-11 items-center">
          {t(TEXT.page)}
        </ExternalLink>
      </div>
    </Notice>
  );
}
