"use client";
/**
 * ICD-11 details for one suggestion card (clinician mode). Sends ONLY an ICD-11 MMS code and a language to our
 * /api/icd11 route (G5, G17). Mounted inside a LazyPanel, so nothing is fetched until the clinician opens it.
 * When the WHO ICD-API is not configured, the route returns a fallback link to the WHO ICD-11 browser.
 * WHO text is shown unmodified (CC BY-ND 3.0 IGO) with the attribution the route returns.
 */
import * as React from "react";
import type { Icd11Result } from "@/server/integrations/who-icd11";
import { ChoiceGroup } from "@/components/ui/choice-group";
import { ExternalLink } from "@/components/ui/external-link";
import { Notice } from "@/components/ui/notice";
import { PART2_NOTICE } from "@/lib/referral-links";
import { useLookup } from "./live-lookup";
import { Attribution, LookupError, LookupLoading, LookupStatusLine } from "./lookup-status";

export type Lang = "en" | "es";
export const LANG_CHOICES = [
  { value: "en", label: "English" },
  { value: "es", label: "Español", lang: "es" },
] as const;

const ICD11_BROWSER = "https://icd.who.int/browse/";

function Icd11Code({ code, label, lang }: { code: string; label: string; lang: Lang }) {
  const { state, retry } = useLookup<Icd11Result>("icd11", { code, lang });
  return (
    <section
      aria-labelledby={`icd11-${code}`}
      aria-busy={state.status === "loading" || undefined}
      data-lookup-focus
      tabIndex={-1}
      className="space-y-2 rounded-lg"
    >
      <h3 id={`icd11-${code}`} className="font-semibold">
        <span className="font-mono">{code}</span> <span className="font-normal text-muted">{label}</span>
      </h3>
      <LookupStatusLine
        state={state}
        what={(d) => ((d as Icd11Result).found ? `ICD-11 ${code} details loaded` : `No ICD-11 entry for ${code}`)}
      />
      <div>
        {state.status === "loading" || state.status === "idle" ? (
          <LookupLoading what={`ICD-11 ${code}`} />
        ) : state.status === "error" ? (
          <LookupError state={state} onRetry={retry} fallback={{ href: ICD11_BROWSER, label: "Open the WHO ICD-11 browser" }} />
        ) : !state.data.found ? (
          <div className="space-y-1">
            <p className="text-muted">No ICD-11 entry was returned for this code in release {state.data.release}.</p>
            <ExternalLink href={state.data.browserUrl}>Open the WHO ICD-11 browser</ExternalLink>
          </div>
        ) : (
          <div className="space-y-2">
            {state.data.title ? (
              <p>
                <span className="font-semibold">WHO title: </span>
                <span lang={state.data.language}>{state.data.title}</span>
                {state.data.language !== lang ? <span className="text-muted"> (no translation; shown in English)</span> : null}
              </p>
            ) : null}
            {state.data.definition ? (
              <p lang={state.data.language} className="rounded-lg bg-surface-2 p-3">
                {state.data.definition}
              </p>
            ) : null}
            {state.data.inclusions.length ? (
              <div>
                <p className="font-semibold">Inclusions</p>
                <ul className="list-disc pl-5" lang={state.data.language}>
                  {state.data.inclusions.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {state.data.exclusions.length ? (
              <div>
                <p className="font-semibold">Exclusions</p>
                <ul className="list-disc pl-5" lang={state.data.language}>
                  {state.data.exclusions.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {state.data.sud ? (
              <Notice tone="warn" title="42 CFR Part 2">
                {PART2_NOTICE}
              </Notice>
            ) : null}
            <p className="flex flex-wrap gap-x-3 text-xs text-muted">
              <span>Release {state.data.release}</span>
              <ExternalLink href={state.data.browserUrl} className="text-xs">
                View in the WHO ICD-11 browser
              </ExternalLink>
            </p>
            <Attribution text={state.attribution} source={state.source} />
          </div>
        )}
      </div>
    </section>
  );
}

/** All ICD-11 codes of one condition, with a language toggle. */
export function Icd11Panel({ codes, conditionId }: { codes: { code: string; label: string }[]; conditionId: string }) {
  const [lang, setLang] = React.useState<Lang>("en");
  return (
    <div className="space-y-4">
      <ChoiceGroup legend="Language" name={`icd11-lang-${conditionId}`} value={lang} options={LANG_CHOICES} onChange={setLang} className="max-w-xs" />
      <p className="text-xs text-muted">Only the ICD-11 code and the language are sent. The definition is WHO wording, not DSM-5-TR text.</p>
      {codes.map((c) => (
        <Icd11Code key={c.code} code={c.code} label={c.label} lang={lang} />
      ))}
    </div>
  );
}
