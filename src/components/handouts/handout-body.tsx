"use client";
import { ShieldCheck } from "lucide-react";
import type { Handout } from "@/lib/schemas";
import { pick, type Lang } from "@/lib/i18n/core";
import { cn } from "@/lib/utils";
import { HANDOUT_TEXT, localizeHandout, withN } from "./localize";

/**
 * Renders a client handout's wording on screen, in English or its Spanish translation (same words as its PDF).
 * `lang` marks the block for screen readers, so a Spanish handout on an English page is read with a Spanish voice.
 */
export function HandoutBody({
  handout,
  lang = "en",
  headingLevel = "h3",
  showLog = true,
  className,
}: {
  handout: Handout;
  lang?: Lang;
  headingLevel?: "h2" | "h3";
  showLog?: boolean;
  className?: string;
}) {
  const h = localizeHandout(handout, lang);
  const tx = (t: { en: string; es?: string }) => pick(t, h.lang);
  const H = headingLevel;
  return (
    <div lang={h.lang} className={cn("space-y-6 text-base leading-relaxed", className)}>
      <p>{h.intro}</p>
      {h.sections.map((sec, si) => (
        <section key={si} className="space-y-2">
          <H className="text-lg font-semibold">{sec.heading}</H>
          {sec.body ? <p>{sec.body}</p> : null}
          {sec.steps ? (
            <ol className="space-y-2">
              {sec.steps.map((step, i) => (
                <li key={i} className="flex gap-3">
                  <span
                    aria-hidden
                    className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-sm font-bold text-accent"
                  >
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="sr-only">{withN(tx(HANDOUT_TEXT.step), i + 1)}</span>
                    {step}
                  </span>
                </li>
              ))}
            </ol>
          ) : null}
        </section>
      ))}

      {showLog && h.practiceLog ? (
        <section className="space-y-2">
          <H className="text-lg font-semibold">{tx(HANDOUT_TEXT.practiceLog)}</H>
          <p className="text-sm text-muted">{withN(tx(HANDOUT_TEXT.logRows), h.practiceLog.rows)}</p>
          <div className="relative overflow-x-auto rounded-lg border border-border" tabIndex={0} role="region" aria-label={tx(HANDOUT_TEXT.logPreview)}>
            <table className="w-full min-w-[32rem] text-left text-sm">
              <thead className="bg-surface-2">
                <tr>
                  {h.practiceLog.columns.map((c) => (
                    <th key={c} scope="col" className="px-3 py-2 font-semibold">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[0, 1].map((r) => (
                  <tr key={r} className="border-t border-border">
                    {h.practiceLog?.columns.map((c) => (
                      <td key={c} className="h-10 px-3" />
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <div className="flex gap-3 rounded-xl border border-warn-border bg-warn-bg p-4 text-sm text-warn-fg">
        <ShieldCheck aria-hidden className="mt-0.5 size-5 shrink-0" />
        <p>{h.safetyNote}</p>
      </div>
    </div>
  );
}
