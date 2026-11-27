import Link from "next/link";
import {
  ArrowRight,
  ClipboardList,
  FileText,
  HeartHandshake,
  ListChecks,
  ListTodo,
  MapPin,
  TextSearch,
  type LucideIcon,
} from "lucide-react";

interface Step {
  icon: LucideIcon;
  title: string;
  body: string;
  href: string;
}

/** The clinical flow (spec section 3, screens 1-7). Original wording; short on purpose. */
const STEPS: readonly Step[] = [
  { icon: TextSearch, title: "Symptoms", body: "Type what the client reports or tap symptoms. Identifiers are scrubbed on this device.", href: "/symptoms" },
  { icon: ListChecks, title: "Possible diagnoses", body: "Considerations with matched and missing features, codes and rule-outs.", href: "/diagnoses" },
  { icon: ClipboardList, title: "Measures", body: "GAD-7 and PHQ-9 with live totals. Nothing is saved.", href: "/measures" },
  { icon: ListTodo, title: "Plan", body: "Problems, goals and objectives in your words, exported without identifiers.", href: "/plan" },
  { icon: HeartHandshake, title: "Interventions", body: "In-session steps, scripts, cautions and cultural notes.", href: "/interventions" },
  { icon: FileText, title: "Handouts", body: "Printable sheets, or a link and QR code for the client.", href: "/handouts" },
  { icon: MapPin, title: "Referrals", body: "Psychiatry, substance use, low-cost and crisis services.", href: "/referrals" },
];

export function ClinicalFlow() {
  return (
    <section aria-labelledby="flow-heading">
      <h2 id="flow-heading" className="text-xl font-semibold">
        How a session flows
      </h2>
      <p className="mt-1 text-sm text-muted">Seven steps, each usable on its own. Every suggestion stays yours to review.</p>
      <ol className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((s, i) => (
          <li key={s.href} className="min-w-0">
            <Link
              href={s.href}
              className="group flex h-full flex-col rounded-xl border border-border bg-surface p-4 transition-colors hover:border-accent"
            >
              <span className="flex items-center gap-2">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-sm font-bold text-accent">
                  {i + 1}
                </span>
                <s.icon aria-hidden className="size-5 text-muted" />
              </span>
              <span className="mt-3 flex items-center gap-1 font-semibold">
                {s.title}
                <ArrowRight aria-hidden className="size-4 shrink-0 transition-transform group-hover:translate-x-0.5" />
              </span>
              <span className="mt-1 text-sm leading-relaxed text-muted">{s.body}</span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
