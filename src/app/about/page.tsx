import type { Metadata } from "next";
import { Ban, EyeOff, FileLock2, LockKeyhole, ScanSearch, ServerOff, ShieldCheck, SpellCheck2, TimerReset } from "lucide-react";
import { conditions, crisisLines, handouts, lexicon, licenses, measures, stats } from "@/lib/content";
import type { Source } from "@/lib/schemas";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ExternalLink } from "@/components/ui/external-link";
import { PageIntro, ReviewBadge } from "@/components/content/content-bits";
import { POSITIONING } from "@/components/content/positioning";
import { countryName } from "@/components/crisis/crisis-data";

export const metadata: Metadata = { title: "About, privacy and licensing" };

const PRIVACY = [
  { icon: Ban, title: "No identifier fields", body: "There is nowhere to enter a name, date of birth, address, phone, email, record number or photo. PDFs carry only a blank name line for handwriting." },
  { icon: ScanSearch, title: "PHI scrubber first", body: "Typed text passes a scrubber for the 18 HIPAA Safe Harbor identifier types before any matching. Anything that looks like an identifier is replaced with a placeholder, and you see which types were removed." },
  { icon: TimerReset, title: "Memory only", body: "Session data lives in this tab’s memory. It is never written to browser storage, cookies, the URL or logs, and it is cleared when the tab closes, after 15 minutes idle, or with Clear session." },
  { icon: EyeOff, title: "No analytics or trackers", body: "No analytics, advertising or tracking scripts, and fonts and images are served from this app." },
  { icon: ServerOff, title: "No third-party connections", body: "A Content Security Policy (connect-src 'self') blocks the browser from sending data to any other host. Phase 1 makes no external API calls; outside links are plain page visits that carry nothing you typed." },
  { icon: FileLock2, title: "PDFs on the device", body: "Handouts and blank forms are generated in the browser. Nothing is uploaded, and no answers or scores are written into a PDF." },
  { icon: SpellCheck2, title: "Turn off cloud spellcheckers", body: "Text boxes here ask the browser not to spellcheck and opt out of Grammarly-style assistants, but browser “enhanced” spellcheck (for example in Chrome or Microsoft Edge) and writing-assistant extensions can still send what you type to their vendors. Turn them off for this site before typing anything." },
] as const;

const GUARDRAILS = [
  "DSM-5-TR text is not reproduced. Features are written in original clinical wording with a “See DSM-5-TR” pointer; wording that may track criteria too closely is being revised and awaits licensed-clinician and legal review.",
  "Wiley PracticePlanners wording is not used.",
  "No final diagnosis is ever stated; every suggestion is labeled “For clinician review” with matched and missing features.",
  "Client mode shows no diagnosis names, codes or scores.",
  "Crisis information is on every screen. Red flags prompt direct assessment; the app never decides risk.",
  "Only measures with a confirmed license are built in; others are link-out only and marked “License pending”.",
  "Third-party worksheets are linked, never copied or re-hosted.",
  "Substance-use information is never stored or transmitted (42 CFR Part 2).",
  "Phase 1 is adult-only; a client-under-18 toggle hides suggestions and adult measures and shows referral links.",
  "Statistics always show their source and data year, and data older than 5 years are flagged.",
  "No AI or LLM services are used.",
  "Unproven treatments are not listed; interventions cite their evidence source.",
];

/** "us-panic-disorder-past-year" -> "US panic disorder past year". */
function statName(id: string): string {
  return id
    .split("-")
    .map((w) => (w === "us" ? "US" : w === "mde" ? "MDE" : w === "gad" ? "GAD" : w === "ptsd" ? "PTSD" : w))
    .join(" ");
}

function statusTone(status: string): "accent" | "info" | "warn" | "neutral" {
  if (status === "confirmed") return "accent";
  if (status.startsWith("confirmed")) return "info";
  if (status === "pending") return "warn";
  return "neutral";
}

function statusLabel(status: string): string {
  if (status === "confirmed") return "Confirmed";
  if (status === "confirmed-with-terms") return "Confirmed, with terms";
  if (status === "pending") return "License pending";
  if (status === "not-licensed") return "Not licensed — not used";
  return status;
}

export default function AboutPage() {
  const reviewItems = [
    { kind: "Symptom lexicon", name: `${lexicon.symptoms.length} symptom features`, item: lexicon },
    ...conditions.map((c) => ({ kind: "Condition", name: c.name, item: c })),
    ...measures.map((m) => ({ kind: "Measure", name: m.shortName, item: m })),
    ...handouts.map((h) => ({ kind: "Handout", name: h.title, item: h })),
    ...stats.map((s) => ({ kind: "Statistic", name: `${s.value} · ${statName(s.id)}`, item: s })),
  ];
  const pending = reviewItems.filter((r) => r.item.reviewedBy === "PENDING").length;

  const sourceMap = new Map<string, Source>();
  for (const s of [lexicon, ...conditions, ...measures, ...handouts, ...stats].flatMap((i) => i.sources)) {
    if (!sourceMap.has(s.url)) sourceMap.set(s.url, s);
  }
  const sources = [...sourceMap.values()].sort((a, b) => a.publisher.localeCompare(b.publisher) || a.title.localeCompare(b.title));

  return (
    <div className="space-y-10">
      <PageIntro title="About, privacy and licensing" eyebrow="Clinician Resource Companion · Phase 1">
        <p className="text-lg text-text">{POSITIONING}</p>
        <p>
          It is built for licensed clinicians (for example LPC/LPCC, LCSW/LISW, LMFT, psychologists, licensed addiction
          counselors and psychiatric nurse practitioners, and their international equivalents). Practice under the license
          that applies where the client is located.
        </p>
      </PageIntro>

      <section aria-labelledby="privacy-heading">
        <h2 id="privacy-heading" className="text-xl font-semibold">
          Privacy by design
        </h2>
        <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {PRIVACY.map((p) => (
            <li key={p.title} className="rounded-2xl border border-border bg-surface p-5">
              <p.icon aria-hidden className="size-5 text-accent" />
              <h3 className="mt-2 font-semibold">{p.title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-muted">{p.body}</p>
            </li>
          ))}
        </ul>
        <Card className="mt-4 space-y-2 text-sm leading-relaxed">
          <h3 className="flex items-center gap-2 font-semibold">
            <LockKeyhole aria-hidden className="size-4 text-muted" /> Business Associate Agreement and 42 CFR Part 2
          </h3>
          <p>
            No Business Associate Agreement (BAA) is offered in Phase 1, and none is in place. Because the app is designed
            not to receive or keep protected health information, do not use it to record client information. A BAA is
            planned before any account features exist; it would oblige the operator to protect PHI, while you remain
            responsible for your own practice and documentation.
          </p>
          <p>
            Substance-use information is never stored or transmitted. Every printable sheet about substance use carries
            this notice in the footer of each page: 42 CFR Part 2 prohibits unauthorized use or disclosure of these records.
          </p>
        </Card>
      </section>

      <section aria-labelledby="licensing-heading">
        <h2 id="licensing-heading" className="text-xl font-semibold">
          Licensing
        </h2>
        <div className="mt-3 max-w-3xl space-y-2 text-sm leading-relaxed">
          <p>
            DSM-5-TR is copyrighted by the American Psychiatric Association and is not reproduced here. Condition feature
            lists are original clinical wording, shown with ICD-10-CM and ICD-11 codes and a “See DSM-5-TR” pointer so you
            can check the official criteria yourself. Wiley PracticePlanners content is not used.
          </p>
          <p>Measures are built in only when their license is confirmed. Current status:</p>
        </div>
        <div className="relative mt-4 overflow-x-auto rounded-xl border border-border bg-surface" tabIndex={0} role="region" aria-label="License status table">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <caption className="sr-only">Measure and content license status</caption>
            <thead className="bg-surface-2">
              <tr>
                <th scope="col" className="px-4 py-2.5 font-semibold">
                  Item
                </th>
                <th scope="col" className="px-4 py-2.5 font-semibold">
                  Status
                </th>
                <th scope="col" className="px-4 py-2.5 font-semibold">
                  Terms
                </th>
                <th scope="col" className="px-4 py-2.5 font-semibold">
                  Checked
                </th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(licenses.items).map(([name, l]) => (
                <tr key={name} className="border-t border-border align-top">
                  <th scope="row" className="px-4 py-2.5 font-semibold">
                    {l.source ? <ExternalLink href={l.source}>{name}</ExternalLink> : name}
                  </th>
                  <td className="px-4 py-2.5">
                    <Badge tone={statusTone(l.status)}>{statusLabel(l.status)}</Badge>
                  </td>
                  <td className="px-4 py-2.5 text-muted">{l.terms}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-muted">{l.lastVerified ?? "Not yet"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="review-heading">
        <div className="flex flex-wrap items-center gap-3">
          <h2 id="review-heading" className="text-xl font-semibold">
            Clinical review status
          </h2>
          <ReviewBadge reviewedBy={pending > 0 ? "PENDING" : "a licensed clinician"} />
        </div>
        <p className="mt-2 max-w-3xl text-sm text-muted">
          {pending} of {reviewItems.length} content items are awaiting sign-off by a licensed clinician. Until then each one
          shows a “Not yet clinically reviewed” badge.
        </p>
        <div className="relative mt-4 overflow-x-auto rounded-xl border border-border bg-surface" tabIndex={0} role="region" aria-label="Review status table">
          <table className="w-full min-w-[36rem] text-left text-sm">
            <caption className="sr-only">Content review status</caption>
            <thead className="bg-surface-2">
              <tr>
                <th scope="col" className="px-4 py-2.5 font-semibold">
                  Type
                </th>
                <th scope="col" className="px-4 py-2.5 font-semibold">
                  Item
                </th>
                <th scope="col" className="px-4 py-2.5 font-semibold">
                  Review
                </th>
                <th scope="col" className="px-4 py-2.5 font-semibold">
                  Last verified
                </th>
              </tr>
            </thead>
            <tbody>
              {reviewItems.map((r, i) => (
                <tr key={`${r.kind}-${i}`} className="border-t border-border">
                  <td className="px-4 py-2 text-muted">{r.kind}</td>
                  <th scope="row" className="px-4 py-2 font-medium">
                    {r.name}
                  </th>
                  <td className="px-4 py-2">{r.item.reviewedBy === "PENDING" ? "Pending" : r.item.reviewedBy}</td>
                  <td className="whitespace-nowrap px-4 py-2 text-muted">{r.item.lastVerified}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="guardrails-heading">
        <h2 id="guardrails-heading" className="text-xl font-semibold">
          Guardrails
        </h2>
        <ul className="mt-4 grid gap-2 md:grid-cols-2">
          {GUARDRAILS.map((g) => (
            <li key={g} className="flex items-start gap-2 rounded-lg border border-border bg-surface p-3 text-sm">
              <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-accent" />
              {g}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="crisis-heading">
        <h2 id="crisis-heading" className="text-xl font-semibold">
          Crisis lines
        </h2>
        <p className="mt-2 max-w-3xl text-sm text-muted">
          Listed numbers come from content/crisis-lines.json and must be re-verified against each official site before
          release.
        </p>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {crisisLines.countries.map((c) => (
            <li key={c.country} className="rounded-lg border border-border bg-surface p-3 text-sm">
              <p className="font-semibold">{countryName(c.country)}</p>
              <p className="text-muted">Emergency {c.emergency}</p>
              <p className="text-muted">{c.crisis}</p>
              <p className="mt-1 text-xs text-muted">Verified: {c.lastVerified ?? "not yet"}</p>
            </li>
          ))}
          <li className="rounded-lg border border-border bg-surface p-3 text-sm">
            <p className="font-semibold">Other countries</p>
            <ExternalLink href={crisisLines.international.url}>{crisisLines.international.name}</ExternalLink>
          </li>
        </ul>
      </section>

      <section aria-labelledby="sources-heading">
        <h2 id="sources-heading" className="text-xl font-semibold">
          Sources ({sources.length})
        </h2>
        <p className="mt-2 max-w-3xl text-sm text-muted">Every content item lists its sources. Combined list:</p>
        <ul className="mt-4 grid gap-x-6 gap-y-2 text-sm md:grid-cols-2">
          {sources.map((s) => (
            <li key={s.url} className="min-w-0">
              <ExternalLink href={s.url} className="break-words">
                {s.title}
              </ExternalLink>
              <span className="text-muted">
                {" "}
                · {s.publisher}
                {s.year ? `, ${s.year}` : ""}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
