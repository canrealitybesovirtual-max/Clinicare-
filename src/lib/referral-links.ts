/**
 * Link-out fallbacks for the referral finders (isomorphic: safe for the browser and the server).
 * Used when a server-side integration is not configured (NotConfigured), rate limited, or down.
 * Nothing is sent anywhere: these only build public URLs plus plain instructions for the clinician.
 *
 * Neither official finder supports a documented deep link with a location:
 * - findtreatment.gov encrypts its search query string client-side (checked 2026-11-26).
 * - findahealthcenter.hrsa.gov documents no URL parameters.
 * So we link to the finder's start page and tell the clinician what to enter there.
 */
import type { Location } from "./outbound";

export interface FinderLink {
  url: string;
  label: string;
  /** What to type on the official site (built only from an already-validated ZIP or city/state). */
  instructions: string;
  phone?: { label: string; number: string };
  publisher: string;
}

/** Exact text required on SUD exports and referral screens (SPEC section 6, guardrail G6). */
export const PART2_NOTICE = "42 CFR Part 2 prohibits unauthorized use or disclosure of these records.";

/** Reminder attached to substance-use referral results. Original wording. */
export const PART2_REMINDER =
  "Substance use disorder (SUD) records are protected by 42 CFR Part 2. This search sent only a location and a facility or provider type; nothing about the client was sent or stored. " +
  PART2_NOTICE;

/** Verified 2026-11-26 on findtreatment.gov (SAMHSA), which links "tel:1-800-662-4357". */
export const SAMHSA_HELPLINE = { label: "SAMHSA National Helpline (free, confidential, 24/7)", number: "1-800-662-4357" } as const;

export const FINDTREATMENT_FINDER_URL = "https://findtreatment.gov/";
export const HRSA_FINDER_URL = "https://findahealthcenter.hrsa.gov/";
export const NPPES_FINDER_URL = "https://npiregistry.cms.hhs.gov/search";

/** "ZIP 20877" or "Gaithersburg, MD". Input must already be a validated Location. */
export function describeLocation(location: Location): string {
  return "zip" in location ? `ZIP ${location.zip}` : `${location.city}, ${location.state}`;
}

/** Public FindTreatment.gov locator (SAMHSA). */
export function findTreatmentLink(location: Location): FinderLink {
  return {
    url: FINDTREATMENT_FINDER_URL,
    label: "Search FindTreatment.gov (SAMHSA)",
    instructions: `On FindTreatment.gov, enter ${describeLocation(location)} and choose mental health, substance use, or both. Call each facility to confirm services and availability.`,
    phone: { label: SAMHSA_HELPLINE.label, number: SAMHSA_HELPLINE.number },
    publisher: "Substance Abuse and Mental Health Services Administration (SAMHSA)",
  };
}

/** Official HRSA "Find a Health Center" locator. */
export function healthCenterLink(location: Location): FinderLink {
  return {
    url: HRSA_FINDER_URL,
    label: "Find a Health Center (HRSA)",
    instructions: `On Find a Health Center, enter ${describeLocation(location)}. HRSA-funded health centers offer a sliding fee scale based on income; call to confirm behavioral health services.`,
    publisher: "Health Resources and Services Administration (HRSA)",
  };
}

/** Public NPI Registry search page (CMS), for when the provider search is unavailable. */
export function providerRegistryLink(location: Location): FinderLink {
  return {
    url: NPPES_FINDER_URL,
    label: "Search the NPI Registry (CMS)",
    instructions: `In the NPI Registry, enter a taxonomy such as "Psychiatry" and ${describeLocation(location)}. A listing is not an endorsement; verify licensure with the state board.`,
    publisher: "Centers for Medicare & Medicaid Services (CMS)",
  };
}
