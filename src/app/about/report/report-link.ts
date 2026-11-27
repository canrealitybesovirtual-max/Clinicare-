/**
 * "Report a content problem" without a text box: a report names one curated item ("type/id") and one curated reason
 * code, and leaves the app as a plain mailto: or https link to the address the operator configured. Nothing typed
 * in the app is ever part of it (G5), so it cannot carry client information. Pure; shared by the page and its form.
 */

export const REPORT_REASONS = [
  { code: "source-broken", label: "A source link is broken or has moved" },
  { code: "outdated", label: "Out of date: a guideline, statistic, phone number or license has changed" },
  { code: "inaccurate", label: "Clinically inaccurate or could mislead" },
  { code: "safety", label: "Safety: crisis information, risk wording or medicine information" },
  { code: "copyright", label: "Wording may be too close to a copyrighted source (DSM-5-TR, a manual or a worksheet)" },
  { code: "client-wording", label: "Client-facing text names a diagnosis or a code, or is hard to read" },
  { code: "translation", label: "A problem with the Spanish version" },
  { code: "bias", label: "Stigmatizing, biased or not culturally responsive" },
  { code: "accessibility", label: "Accessibility: hard to use with a keyboard, screen reader or zoom" },
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number]["code"];

/** Where reports go. Set on the server: CONTENT_REPORT_EMAIL (mailto) or CONTENT_REPORT_URL (an https form). */
export type ReportDestination = { kind: "email"; address: string } | { kind: "url"; url: string };

const EMAIL = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;

/** The configured destination, or null when neither variable holds a valid value (the page then says so). */
export function reportDestination(env: { CONTENT_REPORT_EMAIL?: string; CONTENT_REPORT_URL?: string }): ReportDestination | null {
  const url = env.CONTENT_REPORT_URL?.trim();
  if (url) {
    try {
      const u = new URL(url);
      if (u.protocol === "https:" && !u.username && !u.password) return { kind: "url", url: u.toString() };
    } catch {
      // fall through to the email address
    }
  }
  const address = env.CONTENT_REPORT_EMAIL?.trim();
  return address && EMAIL.test(address) ? { kind: "email", address } : null;
}

/** Fixed text that goes with every report; the only variable parts are the item reference and the reason code. */
export const REPORT_REMINDER = "Please do not add client names, details or any other client information.";

/** The link that sends one report: only the "type/id" reference and the reason code leave the app. */
export function reportHref(dest: ReportDestination, ref: string, reason: ReportReason): string {
  if (dest.kind === "url") {
    const u = new URL(dest.url);
    u.searchParams.set("item", ref);
    u.searchParams.set("reason", reason);
    return u.toString();
  }
  const subject = `Content report: ${ref}`;
  const body = [`Item: ${ref}`, `Reason: ${reason}`, "", REPORT_REMINDER].join("\r\n");
  return `mailto:${dest.address}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
