"use client";
/**
 * Result cards for the live referral searches. Every value shown is PUBLIC listing data returned by our own /api
 * routes (already normalised server-side). Types are imported as types only, so no server code reaches the browser.
 */
import { Building2, Globe, MapPin, Phone, Stethoscope, TriangleAlert, UserRound } from "lucide-react";
import type { ProviderRecord } from "@/server/integrations/nppes";
import type { HealthCenterSite } from "@/server/integrations/hrsa";
import type { TreatmentFacility } from "@/server/integrations/findtreatment";
import type { FinderLink } from "@/lib/referral-links";
import { Badge } from "@/components/ui/badge";
import { ExternalLink } from "@/components/ui/external-link";
import { Notice } from "@/components/ui/notice";
import { milesLabel, telHref } from "./referral-format";

function Address({ address }: { address: { line: string; city: string; state: string; zip5: string } }) {
  const cityLine = [address.city, [address.state, address.zip5].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  if (!address.line && !cityLine) return null;
  return (
    <p className="flex items-start gap-1.5 text-sm">
      <MapPin aria-hidden className="mt-0.5 size-4 shrink-0 text-muted" />
      <span>
        {address.line ? (
          <>
            {address.line}
            <br />
          </>
        ) : null}
        {cityLine}
      </span>
    </p>
  );
}

function PhoneLink({ phone, label, name }: { phone: string | null; label?: string; name: string }) {
  const href = telHref(phone);
  if (!phone || !href) return null;
  return (
    <a href={href} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-accent underline underline-offset-2">
      <Phone aria-hidden className="size-4" />
      {label ? `${label}: ` : null}
      {phone}
      <span className="sr-only"> ({name})</span>
    </a>
  );
}

function Distance({ miles }: { miles: number | null }) {
  const label = milesLabel(miles);
  return label ? <Badge tone="neutral">{label}</Badge> : null;
}

export function ProviderCard({ p }: { p: ProviderRecord }) {
  return (
    <article className="flex h-full flex-col gap-2 rounded-xl border border-border bg-surface p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone="info">
          {p.kind === "organization" ? <Building2 aria-hidden className="size-3.5" /> : <UserRound aria-hidden className="size-3.5" />}
          {p.kind === "organization" ? "Organization" : "Individual"}
        </Badge>
        {p.credential ? <Badge tone="neutral">{p.credential}</Badge> : null}
      </div>
      <h4 className="text-base font-semibold leading-snug">{p.displayName}</h4>
      <p className="flex items-start gap-1.5 text-sm text-muted">
        <Stethoscope aria-hidden className="mt-0.5 size-4 shrink-0" />
        <span>
          {p.taxonomy.description} <span className="font-mono text-xs">({p.taxonomy.code})</span>
          {p.taxonomy.primary ? " · primary taxonomy" : null}
          {p.taxonomy.state ? ` · licensed in ${p.taxonomy.state}` : null}
        </span>
      </p>
      <Address address={p.address} />
      <PhoneLink phone={p.phone} name={p.displayName} />
      <div className="mt-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-border pt-2 text-xs text-muted">
        <ExternalLink href={p.registryUrl} className="inline-flex min-h-11 items-center text-xs">
          NPI Registry record<span className="sr-only"> for {p.displayName}</span>
        </ExternalLink>
        {p.lastUpdated ? <span>Record updated {p.lastUpdated}</span> : null}
      </div>
    </article>
  );
}

export function HealthCenterCard({ s }: { s: HealthCenterSite }) {
  return (
    <article className="flex h-full flex-col gap-2 rounded-xl border border-border bg-surface p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone="accent">Sliding fee</Badge>
        <Badge tone="neutral">{s.locationType === "Unknown" ? s.siteType : `${s.siteType} · ${s.locationType}`}</Badge>
        <Distance miles={s.distanceMiles} />
      </div>
      <h4 className="text-base font-semibold leading-snug">{s.name}</h4>
      <Address address={s.address} />
      <PhoneLink phone={s.phone} name={s.name} />
      {s.website ? (
        <p className="mt-auto border-t border-border pt-2 text-sm">
          <ExternalLink href={s.website} className="inline-flex min-h-11 items-center">
            <Globe aria-hidden className="mr-1 size-4" />
            Website<span className="sr-only"> of {s.name}</span>
          </ExternalLink>
        </p>
      ) : null}
    </article>
  );
}

function ServiceLine({ label, values }: { label: string; values: string[] }) {
  if (!values.length) return null;
  const shown = values.slice(0, 6);
  return (
    <>
      <dt className="font-semibold text-text">{label}</dt>
      <dd>
        {shown.join("; ")}
        {values.length > shown.length ? ` (+${values.length - shown.length} more)` : ""}
      </dd>
    </>
  );
}

export function FacilityCard({ f }: { f: TreatmentFacility }) {
  const s = f.services;
  return (
    <article className="flex h-full flex-col gap-2 rounded-xl border border-border bg-surface p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-1.5">
        {s.facilityTypes.slice(0, 2).map((t) => (
          <Badge key={t} tone="info">
            {t}
          </Badge>
        ))}
        <Distance miles={f.distanceMiles} />
      </div>
      <h4 className="text-base font-semibold leading-snug">{f.name}</h4>
      {f.program ? <p className="text-sm text-muted">{f.program}</p> : null}
      <Address address={f.address} />
      <div className="flex flex-col">
        <PhoneLink phone={f.phone} name={f.name} />
        {f.intakePhone && f.intakePhone !== f.phone ? <PhoneLink phone={f.intakePhone} label="Intake" name={f.name} /> : null}
        {f.hotline && f.hotline !== f.phone ? <PhoneLink phone={f.hotline} label="Hotline" name={f.name} /> : null}
      </div>
      {f.acceptsAdults === false ? (
        <p className="flex items-start gap-1.5 rounded-lg bg-warn-bg p-2 text-xs text-warn-fg">
          <TriangleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          This listing does not name adult services. Confirm the age range before referring.
        </p>
      ) : null}
      <dl className="grid gap-x-3 gap-y-1 text-xs text-muted sm:grid-cols-[auto_1fr]">
        <ServiceLine label="Care" values={s.typeOfCare} />
        <ServiceLine label="Settings" values={s.settings} />
        <ServiceLine label="Emergency" values={s.emergency} />
        <ServiceLine label="Payment" values={s.payment} />
        <ServiceLine label="Assistance" values={s.paymentAssistance} />
        <ServiceLine label="Ages" values={s.ageGroups} />
        <ServiceLine label="Languages" values={s.languages} />
      </dl>
      {f.website ? (
        <p className="mt-auto border-t border-border pt-2 text-sm">
          <ExternalLink href={f.website} className="inline-flex min-h-11 items-center">
            <Globe aria-hidden className="mr-1 size-4" />
            Website<span className="sr-only"> of {f.name}</span>
          </ExternalLink>
        </p>
      ) : null}
    </article>
  );
}

/** Link-out to the official finder when live search is unavailable (not configured, offline, rate limited). */
export function FinderFallback({ finder, className }: { finder: FinderLink; className?: string }) {
  const tel = finder.phone ? telHref(finder.phone.number) : null;
  return (
    <div className={className}>
      <p className="text-sm">
        <ExternalLink href={finder.url} className="inline-flex min-h-11 items-center font-semibold">
          {finder.label}
        </ExternalLink>
      </p>
      <p className="text-sm leading-relaxed">{finder.instructions}</p>
      {finder.phone && tel ? (
        <p className="text-sm">
          {finder.phone.label}:{" "}
          <a href={tel} className="inline-flex min-h-11 items-center font-semibold text-accent underline underline-offset-2">
            {finder.phone.number}
          </a>
        </p>
      ) : null}
      <p className="text-xs text-muted">Publisher: {finder.publisher}. Nothing is sent from this app when you open it.</p>
    </div>
  );
}

export function EndorsementNote() {
  return (
    <Notice tone="neutral" title="Listing is not an endorsement — call to confirm.">
      <p>
        Confirm services, availability, fees, insurance and licensure directly before referring. Listings come from
        public registries and can be out of date.
      </p>
    </Notice>
  );
}
