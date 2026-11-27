"use client";
import * as React from "react";
import { Globe, Languages, MessageSquareText, Phone, Siren } from "lucide-react";
import { useSession } from "@/state/session";
import { fill, useLang, useT } from "@/lib/i18n/core";
import { CRISIS } from "@/lib/i18n/shell";
import { buttonVariants } from "@/components/ui/button";
import { ExternalLink } from "@/components/ui/external-link";
import { cn } from "@/lib/utils";
import {
  OTHER_COUNTRY,
  countryName,
  crisisCanText,
  crisisLines,
  crisisLinesVerified,
  crisisNumber,
  displayUrl,
  emergencyNumbers,
  findCountry,
} from "./crisis-data";

/** Country picker for crisis lines. The choice lives in memory only (session.country). */
export function CrisisCountrySelect({ className }: { className?: string }) {
  const { state, set } = useSession();
  const { lang } = useLang();
  const t = useT();
  const id = React.useId();
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-sm font-semibold">
        {t(CRISIS.country)}
      </label>
      <select
        id={id}
        value={state.country}
        onChange={(e) => set({ country: e.target.value })}
        className="min-h-11 rounded-xl border border-input-border bg-surface px-3 text-sm text-text"
      >
        {crisisLines.countries.map((c) => (
          <option key={c.country} value={c.country}>
            {countryName(c.country, lang)}
          </option>
        ))}
        <option value={OTHER_COUNTRY}>{t(CRISIS.otherCountry)}</option>
      </select>
    </div>
  );
}

/**
 * Full crisis information for the selected country: emergency number first, then the crisis line
 * (call / text), its website and findahelpline.com. Never hidden, never decides risk (G9).
 * Service names and descriptions come from content in English; in Spanish they keep lang="en".
 */
export function CrisisPanel({
  headingLevel = "h3",
  plain = false,
}: {
  headingLevel?: "h2" | "h3";
  /** Plain-language wording for client mode. */
  plain?: boolean;
}) {
  const { state } = useSession();
  const t = useT();
  const country = findCountry(state.country);
  const H = headingLevel;
  const emergency = country ? emergencyNumbers(country) : [];
  const line = country ? crisisNumber(country) : null;
  const canText = country ? crisisCanText(country) : false;

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border-l-[6px] border-crisis bg-surface-2 p-4">
        <p className="flex items-start gap-2 text-base font-semibold leading-snug">
          <Siren aria-hidden className="mt-0.5 size-5 shrink-0 text-crisis" />
          <span>
            {country
              ? fill(t(plain ? CRISIS.dangerClient : CRISIS.dangerClinician), { number: country.emergency })
              : t(plain ? CRISIS.dangerClientLocal : CRISIS.dangerClinicianLocal)}
          </span>
        </p>
        {emergency.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {emergency.map((n) => (
              <a key={n} href={`tel:${n}`} className={buttonVariants({ variant: "crisis", size: "lg" })}>
                <Phone aria-hidden />
                {fill(t(CRISIS.call), { number: n })}
              </a>
            ))}
          </div>
        ) : null}
      </div>

      <CrisisCountrySelect />

      {country ? (
        <div className="space-y-2.5">
          <H className="text-sm font-semibold">{t(plain ? CRISIS.lineHeadingClient : CRISIS.lineHeading)}</H>
          <p className="text-sm" lang="en">
            {country.crisis}
          </p>
          {line ? (
            <div className="flex flex-wrap gap-2">
              <a href={`tel:${line}`} className={buttonVariants({ variant: "primary" })}>
                <Phone aria-hidden />
                {fill(t(CRISIS.call), { number: line })}
              </a>
              {canText ? (
                <a href={`sms:${line}`} className={buttonVariants({ variant: "outline" })}>
                  <MessageSquareText aria-hidden />
                  {fill(t(CRISIS.text), { number: line })}
                </a>
              ) : null}
            </div>
          ) : null}
          {country.country === "US" ? (
            <p className="flex items-start gap-2 text-sm">
              <Languages aria-hidden className="mt-0.5 size-4 shrink-0 text-muted" />
              {t(CRISIS.spanishUS)}
            </p>
          ) : null}
          <p className="text-sm">
            {t(CRISIS.website)} <ExternalLink href={country.url}>{displayUrl(country.url)}</ExternalLink>
          </p>
        </div>
      ) : (
        <p className="text-sm">{t(plain ? CRISIS.noLineClient : CRISIS.noLineClinician)}</p>
      )}

      <div className="flex items-start gap-2 text-sm">
        <Globe aria-hidden className="mt-0.5 size-4 shrink-0 text-muted" />
        <p>
          {t(CRISIS.otherCountries)}{" "}
          <ExternalLink href={crisisLines.international.url}>{displayUrl(crisisLines.international.url)}</ExternalLink>
          <span className="text-muted" lang="en">
            {" "}
            ({crisisLines.international.name})
          </span>
        </p>
      </div>

      <p className="rounded-xl bg-surface-2 p-3 text-xs text-muted">
        {plain
          ? t(CRISIS.clientNote)
          : `${t(crisisLinesVerified ? CRISIS.confirmLocal : CRISIS.unverified)} ${t(CRISIS.noRisk)}`}
      </p>
    </div>
  );
}

/** One-line crisis numbers for banners (red flags, PHQ-9 item 9). */
export function CrisisInline({ className }: { className?: string }) {
  const { state } = useSession();
  const { lang } = useLang();
  const t = useT();
  const country = findCountry(state.country);
  const line = country ? crisisNumber(country) : null;
  const emergency = country ? emergencyNumbers(country) : [];
  return (
    <p className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 text-sm", className)}>
      {country && line ? (
        <a href={`tel:${line}`} className="inline-flex min-h-11 items-center gap-1.5 font-semibold text-crisis underline underline-offset-2">
          <Phone aria-hidden className="size-4" />
          {fill(t(crisisCanText(country) ? CRISIS.callOrText : CRISIS.call), { number: line })}
          <span className="sr-only">{fill(t(CRISIS.lineOf), { country: countryName(country.country, lang) })}</span>
        </a>
      ) : null}
      {country && emergency[0] ? (
        <a href={`tel:${emergency[0]}`} className="inline-flex min-h-11 items-center gap-1.5 font-semibold text-crisis underline underline-offset-2">
          <Siren aria-hidden className="size-4" />
          {fill(t(CRISIS.emergency), { number: country.emergency })}
        </a>
      ) : (
        <span className="font-semibold">{t(CRISIS.localEmergency)}</span>
      )}
      <ExternalLink href={crisisLines.international.url} className="inline-flex min-h-11 items-center">
        {displayUrl(crisisLines.international.url)}
      </ExternalLink>
    </p>
  );
}
