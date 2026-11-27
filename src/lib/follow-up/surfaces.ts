/**
 * What each surface means on screen. Surfaces are static resources an answer brings forward because the
 * CLINICIAN chose that answer; they are never a computed risk level (G9). The crisis button stays visible
 * on every screen regardless.
 * `href` values are in-app routes; the crisis surface opens the existing crisis panel instead of a link.
 */
import { PART2_NOTICE } from "@/lib/referral-links";
import type { Surface } from "@/lib/schemas-follow-up";

export interface SurfaceInfo {
  label: string;
  description: string;
  href?: string;
  /** Show at the top, styled as urgent. */
  urgent: boolean;
}

export const SURFACE_INFO: Readonly<Record<Surface, SurfaceInfo>> = {
  "crisis-resources": {
    label: "Crisis resources",
    description:
      "988 Suicide & Crisis Lifeline (call or text 988 in the US), local emergency services, or findahelpline.com outside the US.",
    urgent: true,
  },
  "safety-plan": {
    label: "Safety plan",
    description: "Build or review a safety plan together; the client can keep the safety plan handout.",
    href: "/handouts/safety-plan",
    urgent: true,
  },
  "lethal-means": {
    label: "Lethal means counseling",
    description: "Talk together about putting time and distance between the client and lethal means.",
    href: "/interventions/lethal-means-counseling",
    urgent: true,
  },
  "urgent-medical": {
    label: "Urgent medical assessment",
    description: "Arrange an urgent medical assessment (for example, possible alcohol withdrawal) before other changes.",
    urgent: true,
  },
  "psychiatric-referral": {
    label: "Psychiatric evaluation",
    description: "Consider a referral to a psychiatrist or psychiatric nurse practitioner.",
    href: "/referrals",
    urgent: false,
  },
  "medical-referral": {
    label: "Medical review",
    description: "Suggest a primary care review to rule out physical causes.",
    href: "/referrals",
    urgent: false,
  },
  "part2-notice": {
    label: "42 CFR Part 2",
    description: PART2_NOTICE,
    urgent: false,
  },
};
