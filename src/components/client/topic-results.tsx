"use client";
/**
 * MedlinePlus Health Topics results for one client-mode topic (G3, G5, G17).
 * - Only the curated topic id and a language code are sent to our /api/health-topics route.
 * - MedlinePlus titles and summaries can name a diagnosis, so each one passes the client-mode filter first; when a
 *   title is not plain-safe a neutral label is used, and an unsafe summary is not shown.
 * - Always shows the attribution string the route returns ("Information from MedlinePlus.gov").
 * - Offline, rate-limited or not configured: a retry button where it helps, and the topic's MedlinePlus page as a
 *   plain link that needs no lookup.
 */
import * as React from "react";
import type { HealthTopicsResult } from "@/server/integrations/medlineplus-topics";
import { ChoiceGroup } from "@/components/ui/choice-group";
import { ExternalLink } from "@/components/ui/external-link";
import { useLookup } from "@/components/diagnoses/live-lookup";
import { Attribution, LookupError, LookupLoading, LookupStatusLine } from "@/components/diagnoses/lookup-status";
import { firstPlainSafe, isPlainSafe } from "./plain-text";
import type { ClientTopic } from "./topics";

type Lang = "en" | "es";
const LANGS = [
  { value: "en", label: "English" },
  { value: "es", label: "Español", lang: "es" },
] as const;

const COPY: Record<Lang, { more: (n: number) => string; page: string; none: string }> = {
  en: {
    more: (n) => `More on MedlinePlus (${n})`,
    page: "Open the MedlinePlus page for this topic",
    none: "No pages came back for this topic.",
  },
  es: {
    more: (n) => `Más información en MedlinePlus (${n})`,
    page: "Abrir la página de MedlinePlus sobre este tema",
    none: "No se encontraron páginas para este tema.",
  },
};

export function TopicResults({ topic }: { topic: ClientTopic }) {
  const [lang, setLang] = React.useState<Lang>("en");
  const { state, retry } = useLookup<HealthTopicsResult>("health-topics", { topic: topic.id, lang, max: 5 });
  const copy = COPY[lang];
  const page = topic.pages[lang];

  return (
    <div className="space-y-4">
      <ChoiceGroup
        legend={
          <>
            Language / <span lang="es">Idioma</span>
          </>
        }
        name={`topic-lang-${topic.id}`}
        value={lang}
        options={LANGS}
        onChange={setLang}
        className="max-w-xs"
      />
      <LookupStatusLine
        plain
        state={state}
        what={(d) => {
          const n = (d as HealthTopicsResult).items.length;
          return `${n} page${n === 1 ? "" : "s"} from MedlinePlus loaded`;
        }}
      />
      <div
        role="group"
        aria-label="Pages from MedlinePlus"
        aria-busy={state.status === "loading" || undefined}
        data-lookup-focus
        tabIndex={-1}
        className="rounded-lg"
      >
        {state.status === "idle" || state.status === "loading" ? (
          <LookupLoading what="pages from MedlinePlus" />
        ) : state.status === "error" ? (
          <LookupError state={state} onRetry={retry} fallback={{ href: page, label: copy.page }} plain />
        ) : state.data.items.length === 0 ? (
          <div className="space-y-2" lang={lang}>
            <p className="text-muted">{copy.none}</p>
            <ExternalLink href={page}>{copy.page}</ExternalLink>
          </div>
        ) : (
          <div className="space-y-4">
            <ul className="space-y-4" lang={lang}>
              {state.data.items.map((item, i) => {
                const title = firstPlainSafe([item.title, ...item.altTitles]) ?? copy.more(i + 1);
                const summary = item.summary && isPlainSafe(item.summary) ? item.summary : null;
                return (
                  <li key={item.url} className="rounded-xl border border-border bg-surface p-4">
                    <ExternalLink href={item.url} className="text-base">
                      {title}
                    </ExternalLink>
                    {summary ? <p className="mt-1.5 text-sm leading-relaxed text-muted">{summary}</p> : null}
                  </li>
                );
              })}
            </ul>
            <p className="text-sm" lang={lang}>
              <ExternalLink href={page}>{copy.page}</ExternalLink>
            </p>
            <Attribution text={state.attribution} source={state.source} />
          </div>
        )}
      </div>
    </div>
  );
}
