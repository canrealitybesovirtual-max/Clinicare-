import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Clock, PenLine } from "lucide-react";
import { allHandouts } from "@/lib/library";
import { TalkToSomeone } from "@/components/client/talk-to-someone";

export const metadata: Metadata = { title: "Skills" };

/* Client mode (G3): every app-authored client handout, plain titles only. */

function clipIntro(s: string, max = 150): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), max - 20)).trimEnd()}…`;
}

export default function ClientSkillsPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <Link href="/client" className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-accent">
        <ArrowLeft aria-hidden className="size-4" /> Self-help home
      </Link>
      <div className="max-w-3xl">
        <p className="text-sm font-semibold uppercase tracking-wide text-accent">Self-help</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">Skills you can practice</h1>
        <p className="mt-3 text-lg leading-relaxed text-muted">
          Short, plain-language sheets. Read them here or print them. Each one takes a few minutes.
        </p>
      </div>
      <ul className="grid gap-4 sm:grid-cols-2">
        {allHandouts.map((h) => (
          <li key={h.id}>
            <Link
              href={`/client/skills/${h.id}`}
              className="group flex h-full flex-col gap-1.5 rounded-xl border border-border bg-surface p-4 shadow-sm transition-colors hover:border-accent"
            >
              <span className="flex items-center gap-1.5 text-base font-semibold">
                {h.title}
                <ArrowRight aria-hidden className="size-4 shrink-0 transition-transform group-hover:translate-x-0.5" />
              </span>
              <span className="text-sm leading-relaxed text-muted">{clipIntro(h.intro)}</span>
              <span className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-xs text-muted">
                <span className="inline-flex items-center gap-1">
                  <Clock aria-hidden className="size-3.5" /> About {h.estimatedMinutes} minutes
                </span>
                {h.practiceLog ? (
                  <span className="inline-flex items-center gap-1">
                    <PenLine aria-hidden className="size-3.5" /> Has a log to fill in
                  </span>
                ) : null}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <TalkToSomeone id="skills-talk" title="Talk with a licensed professional" />
    </div>
  );
}
