"use client";
import * as React from "react";
import { Globe, MessageSquareText, Phone, Siren } from "lucide-react";
import { crisisLines } from "@/lib/content";
import { useSession } from "@/state/session";
import { buttonVariants } from "@/components/ui/button";
import { ExternalLink } from "@/components/ui/external-link";
import { cn } from "@/lib/utils";
import {
  OTHER_COUNTRY,
  countryName,
  crisisCanText,
  crisisNumber,
  displayUrl,
  emergencyNumbers,
  findCountry,
} from "./crisis-data";

/** Country picker for crisis lines. The choice lives in memory only (session.country). */
export function CrisisCountrySelect({ className }: { className?: string }) {
  const { state, set } = useSession();
  const id = React.useId();
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <label htmlFor={id} className="text-sm font-semibold">
        Country
      </label>
      <select
        id={id}
        value={state.country}
        onChange={(e) => set({ country: e.target.value })}
        className="min-h-11 rounded-lg border border-border bg-surface px-3 text-sm text-text"
      >
        {crisisLines.countries.map((c) => (
          <option key={c.country} value={c.country}>
            {countryName(c.country)}
          </option>
        ))}
        <option value={OTHER_COUNTRY}>Another country</option>
      </select>
    </div>
  );
}

/**
 * Full crisis information for the selected country: emergency number first, then the crisis line
 * (call / text), its website and findahelpline.com. Never hidden, never decides risk (G9).
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
  const country = findCountry(state.country);
  const H = headingLevel;
  const emergency = country ? emergencyNumbers(country) : [];
  const line = country ? crisisNumber(country) : null;
  const canText = country ? crisisCanText(country) : false;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border-l-[6px] border-crisis bg-surface-2 p-4">
        <p className="flex items-start gap-2 text-base font-semibold leading-snug">
          <Siren aria-hidden className="mt-0.5 size-5 shrink-0 text-crisis" />
          <span>
            {plain ? "If you or someone else is in danger right now, call " : "If someone is in immediate danger, call "}
            {country ? country.emergency : "your local emergency number"}
            {plain ? "." : " now."}
          </span>
        </p>
        {emergency.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {emergency.map((n) => (
              <a key={n} href={`tel:${n}`} className={buttonVariants({ variant: "crisis", size: "lg" })}>
                <Phone aria-hidden />
                Call {n}
              </a>
            ))}
          </div>
        ) : null}
      </div>

      <CrisisCountrySelect />

      {country ? (
        <div className="space-y-2">
          <H className="text-sm font-semibold">{plain ? "Talk to someone now" : "Crisis line"}</H>
          <p className="text-sm">{country.crisis}</p>
          {line ? (
            <div className="flex flex-wrap gap-2">
              <a href={`tel:${line}`} className={buttonVariants({ variant: "primary" })}>
                <Phone aria-hidden />
                Call {line}
              </a>
              {canText ? (
                <a href={`sms:${line}`} className={buttonVariants({ variant: "outline" })}>
                  <MessageSquareText aria-hidden />
                  Text {line}
                </a>
              ) : null}
            </div>
          ) : null}
          <p className="text-sm">
            Website: <ExternalLink href={country.url}>{displayUrl(country.url)}</ExternalLink>
          </p>
        </div>
      ) : (
        <p className="text-sm">
          {plain
            ? "Call your local emergency number. To find a free helpline in your country, use the link below."
            : "Call the local emergency number. Use the directory below to find a crisis line in that country."}
        </p>
      )}

      <div className="flex items-start gap-2 text-sm">
        <Globe aria-hidden className="mt-0.5 size-4 shrink-0 text-muted" />
        <p>
          {plain ? "Other countries: " : "Other countries: "}
          <ExternalLink href={crisisLines.international.url}>{displayUrl(crisisLines.international.url)}</ExternalLink>
          <span className="text-muted"> ({crisisLines.international.name})</span>
        </p>
      </div>

      <p className="rounded-lg bg-surface-2 p-3 text-xs text-muted">
        {plain
          ? "Phone numbers can change. Check your local number. This app cannot tell how safe you are; a person can help."
          : "Verify numbers locally before relying on them; this list has not yet been re-verified for release. This app does not assess or decide risk."}
      </p>
    </div>
  );
}

/** One-line crisis numbers for banners (red flags, PHQ-9 item 9). */
export function CrisisInline({ className }: { className?: string }) {
  const { state } = useSession();
  const country = findCountry(state.country);
  const line = country ? crisisNumber(country) : null;
  const emergency = country ? emergencyNumbers(country) : [];
  return (
    <p className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 text-sm", className)}>
      {country && line ? (
        <a href={`tel:${line}`} className="inline-flex min-h-11 items-center gap-1.5 font-semibold text-crisis underline underline-offset-2">
          <Phone aria-hidden className="size-4" />
          {crisisCanText(country) ? `Call or text ${line}` : `Call ${line}`}
          <span className="sr-only"> ({countryName(country.country)} crisis line)</span>
        </a>
      ) : null}
      {emergency[0] ? (
        <a href={`tel:${emergency[0]}`} className="inline-flex min-h-11 items-center gap-1.5 font-semibold text-crisis underline underline-offset-2">
          <Siren aria-hidden className="size-4" />
          Emergency {country?.emergency}
        </a>
      ) : (
        <span className="font-semibold">Local emergency number</span>
      )}
      <ExternalLink href={crisisLines.international.url} className="inline-flex min-h-11 items-center">
        {displayUrl(crisisLines.international.url)}
      </ExternalLink>
    </p>
  );
}
