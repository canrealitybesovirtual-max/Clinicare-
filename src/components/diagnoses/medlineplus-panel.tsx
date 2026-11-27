"use client";
/**
 * MedlinePlus Connect psychoeducation links for a condition's primary ICD-10-CM code (clinician mode). Sends ONLY
 * the code and a language (en | es) to our /api/medlineplus route (G5, G17). Mounted inside a LazyPanel, so nothing
 * is fetched until opened. Attribution "Information from MedlinePlus.gov" (from the route); no logo, no implied
 * endorsement.
 */
import * as React from "react";
import type { MedlinePlusConnectResult } from "@/server/integrations/medlineplus-connect";
import { ChoiceGroup } from "@/components/ui/choice-group";
import { ExternalLink } from "@/components/ui/external-link";
import { Notice } from "@/components/ui/notice";
import { PART2_NOTICE } from "@/lib/referral-links";
import { useLookup } from "./live-lookup";
import { Attribution, LookupError, LookupLoading } from "./lookup-status";
import { LANG_CHOICES, type Lang } from "./icd11-panel";

const MEDLINEPLUS_HOME: Record<Lang, string> = {
  en: "https://medlineplus.gov/healthtopics.html",
  es: "https://medlineplus.gov/spanish/healthtopics.html",
};

export function MedlinePlusPanel({ code, conditionId }: { code: string; conditionId: string }) {
  const [lang, setLang] = React.useState<Lang>("en");
  const { state, retry } = useLookup<MedlinePlusConnectResult>("medlineplus", { code, lang });
  return (
    <div className="space-y-3">
      <ChoiceGroup legend="Language" name={`mlp-lang-${conditionId}`} value={lang} options={LANG_CHOICES} onChange={setLang} className="max-w-xs" />
      <p className="text-xs text-muted">
        Plain-language pages matched to <span className="font-mono">{code}</span>. Only the code and the language are sent.
        Review a page before you share it with a client.
      </p>
      <div aria-live="polite" aria-busy={state.status === "loading" || undefined}>
        {state.status === "loading" || state.status === "idle" ? (
          <LookupLoading what="MedlinePlus pages" />
        ) : state.status === "error" ? (
          <LookupError state={state} onRetry={retry} fallback={{ href: MEDLINEPLUS_HOME[lang], label: "Browse MedlinePlus health topics" }} />
        ) : state.data.items.length === 0 ? (
          <div className="space-y-1">
            <p className="text-muted">MedlinePlus returned no page for this code.</p>
            <ExternalLink href={MEDLINEPLUS_HOME[lang]}>Browse MedlinePlus health topics</ExternalLink>
          </div>
        ) : (
          <div className="space-y-3">
            {state.data.sud ? (
              <Notice tone="warn" title="42 CFR Part 2">
                {PART2_NOTICE}
              </Notice>
            ) : null}
            <ul className="space-y-3" lang={state.data.language}>
              {state.data.items.map((p) => (
                <li key={p.url}>
                  <ExternalLink href={p.url}>{p.title}</ExternalLink>
                  {p.summary ? <p className="mt-0.5 text-muted">{p.summary}</p> : null}
                </li>
              ))}
            </ul>
            <Attribution text={state.attribution} source={state.source} />
          </div>
        )}
      </div>
    </div>
  );
}
