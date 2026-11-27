import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ShieldCheck, Wind } from "lucide-react";
import { PageIntro } from "@/components/content/content-meta";
import { TOOLS } from "@/components/tools/catalog";

export const metadata: Metadata = { title: "Session tools" };

export default function ToolsPage() {
  return (
    <div className="mx-auto max-w-4xl">
      <PageIntro title="Session tools" eyebrow="Tools">
        <p>Small helpers for the session itself. Nothing you enter is saved, sent or kept after you leave the page.</p>
      </PageIntro>
      <ul className="grid gap-3 sm:grid-cols-2">
        {TOOLS.map((t) => (
          <li key={t.href}>
            <Link
              href={t.href}
              className="group flex h-full min-h-11 items-start gap-3 rounded-2xl border border-border bg-surface p-4 shadow-sm transition-colors hover:border-accent sm:p-5"
            >
              <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
                <t.icon aria-hidden className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 text-base font-semibold">
                  {t.title}
                  <ArrowRight aria-hidden className="size-4 shrink-0 transition-transform group-hover:translate-x-0.5" />
                </span>
                <span className="mt-1 block text-sm leading-relaxed text-muted">{t.line}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-6 flex items-start gap-2 text-sm text-muted">
        <Wind aria-hidden className="mt-0.5 size-4 shrink-0 text-accent" />
        <span>
          For the client: breathing, grounding and muscle relaxation are in{" "}
          <Link href="/client/calm" className="font-semibold text-accent underline underline-offset-2">
            client mode, Calm
          </Link>
          , in English and Spanish.
        </span>
      </p>
      <p className="mt-3 flex items-start gap-2 text-sm text-muted">
        <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-accent" />
        <span>Free-text fields remove likely identifiers as you type. Exports have one blank line for a name, written by hand.</span>
      </p>
    </div>
  );
}
