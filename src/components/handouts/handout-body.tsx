import { ShieldCheck } from "lucide-react";
import type { Handout } from "@/lib/schemas";
import { cn } from "@/lib/utils";

/** Renders a client handout's original wording on screen (same content as its PDF). */
export function HandoutBody({
  handout,
  headingLevel = "h3",
  showLog = true,
  className,
}: {
  handout: Handout;
  headingLevel?: "h2" | "h3";
  showLog?: boolean;
  className?: string;
}) {
  const H = headingLevel;
  return (
    <div className={cn("space-y-6 text-base leading-relaxed", className)}>
      <p>{handout.intro}</p>
      {handout.sections.map((sec) => (
        <section key={sec.heading} className="space-y-2">
          <H className="text-lg font-semibold">{sec.heading}</H>
          {sec.body ? <p>{sec.body}</p> : null}
          {sec.steps ? (
            <ol className="space-y-2">
              {sec.steps.map((step, i) => (
                <li key={step} className="flex gap-3">
                  <span
                    aria-hidden
                    className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-sm font-bold text-accent"
                  >
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="sr-only">Step {i + 1}: </span>
                    {step}
                  </span>
                </li>
              ))}
            </ol>
          ) : null}
        </section>
      ))}

      {showLog && handout.practiceLog ? (
        <section className="space-y-2">
          <H className="text-lg font-semibold">Practice log</H>
          <p className="text-sm text-muted">The printable PDF has {handout.practiceLog.rows} blank rows to fill in by hand.</p>
          <div className="relative overflow-x-auto rounded-lg border border-border" tabIndex={0} role="region" aria-label="Practice log preview">
            <table className="w-full min-w-[32rem] text-left text-sm">
              <thead className="bg-surface-2">
                <tr>
                  {handout.practiceLog.columns.map((c) => (
                    <th key={c} scope="col" className="px-3 py-2 font-semibold">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[0, 1].map((r) => (
                  <tr key={r} className="border-t border-border">
                    {handout.practiceLog?.columns.map((c) => (
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
        <p>{handout.safetyNote}</p>
      </div>
    </div>
  );
}
