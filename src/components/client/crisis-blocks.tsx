"use client";
/**
 * Crisis help on client pages (G9), in plain English or Spanish. Never hidden and never deciding risk:
 * - CrisisStrip: a short, calm line with tap-to-call and tap-to-text links, high on every client page;
 * - HelpNowCard: the full crisis panel (country picker, emergency number, crisis line, findahelpline.com).
 * The header's "Get help now" button stays on every screen as well.
 */
import { Siren } from "lucide-react";
import { useT } from "@/lib/i18n/core";
import { Card } from "@/components/ui/card";
import { CrisisInline, CrisisPanel } from "@/components/crisis/crisis-panel";
import { cn } from "@/lib/utils";

export const HELP_NOW = { en: "Need help right now?", es: "¿Necesita ayuda ahora?" };

const STRIP = {
  en: "If you are in danger or thinking about hurting yourself, get help now.",
  es: "Si está en peligro o piensa en hacerse daño, busque ayuda ahora.",
};

export function CrisisStrip({ className }: { className?: string }) {
  const t = useT();
  return (
    <div className={cn("rounded-2xl border border-crisis/30 border-l-[6px] border-l-crisis bg-surface p-4", className)}>
      <p className="flex items-start gap-2 font-semibold">
        <Siren aria-hidden className="mt-0.5 size-5 shrink-0 text-crisis" />
        {t(STRIP)}
      </p>
      <CrisisInline className="mt-1" />
    </div>
  );
}

export function HelpNowCard({ id }: { id: string }) {
  const t = useT();
  return (
    <section aria-labelledby={id}>
      <Card className="border-crisis/30 sm:p-6">
        <h2 id={id} className="mb-4 flex items-center gap-2 text-xl font-bold">
          <Siren aria-hidden className="size-6 text-crisis" />
          {t(HELP_NOW)}
        </h2>
        <CrisisPanel plain headingLevel="h3" />
      </Card>
    </section>
  );
}
