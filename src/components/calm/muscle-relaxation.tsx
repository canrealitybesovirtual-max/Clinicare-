"use client";
import * as React from "react";
import { Pause, Play, RotateCcw, Square } from "lucide-react";
import { fill, useT } from "@/lib/i18n/core";
import { Button } from "@/components/ui/button";
import { CALM, RELAX, RELAX_GROUPS, RELEASE_SECONDS, TIGHTEN_SECONDS } from "./calm-text";
import { relaxState } from "./pacing";
import { useTicker } from "./use-ticker";

/**
 * Short guided muscle relaxation: six body areas, a few seconds of gentle tightening, then a longer rest. A text
 * countdown (no animation) and a polite live region for each new instruction.
 */
export function MuscleRelaxation() {
  const t = useT();
  const ticker = useTicker(250);
  const s = relaxState(ticker.elapsedMs, RELAX_GROUPS.length, TIGHTEN_SECONDS, RELEASE_SECONDS);
  const group = RELAX_GROUPS[s.group];
  const finished = s.phase === "done";

  const { running, pause } = ticker;
  React.useEffect(() => {
    if (finished && running) pause();
  }, [finished, running, pause]);

  const instruction = group ? `${t(group.name)}. ${t(s.phase === "tighten" ? RELAX.tighten : RELAX.letGo)}.` : "";

  return (
    <div className="space-y-5">
      <p className="text-base leading-relaxed text-muted">{t(RELAX.why)}</p>
      <div className="space-y-3 rounded-3xl bg-accent-soft px-5 py-6 text-center">
        {!ticker.started ? (
          <Button type="button" size="lg" variant="accent" onClick={ticker.start} className="min-w-40">
            <Play aria-hidden />
            {t(CALM.start)}
          </Button>
        ) : finished || !group ? (
          <>
            <h3 className="text-2xl font-semibold">{t(RELAX.doneTitle)}</h3>
            <p aria-live="polite" className="text-base leading-relaxed">
              {t(RELAX.done)}
            </p>
            <Button type="button" size="lg" variant="outline" onClick={ticker.start}>
              <RotateCcw aria-hidden />
              {t(CALM.again)}
            </Button>
          </>
        ) : (
          <>
            <p className="text-sm font-semibold text-accent">{fill(t(RELAX.groupOf), { n: s.group + 1, total: RELAX_GROUPS.length })}</p>
            <p aria-live="polite" className="text-2xl font-semibold">
              {instruction}
            </p>
            <p className="mx-auto max-w-md text-lg leading-relaxed">{t(s.phase === "tighten" ? group.tighten : group.release)}</p>
            <p className="font-mono text-6xl font-bold tabular-nums text-accent" aria-hidden>
              {s.secondsLeft}
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <Button type="button" size="lg" variant="accent" onClick={ticker.running ? ticker.pause : ticker.resume} className="min-w-36">
                {ticker.running ? <Pause aria-hidden /> : <Play aria-hidden />}
                {t(ticker.running ? CALM.pause : CALM.resume)}
              </Button>
              <Button type="button" size="lg" variant="ghost" onClick={ticker.reset}>
                <Square aria-hidden />
                {t(CALM.stop)}
              </Button>
            </div>
          </>
        )}
      </div>
      <p className="text-sm text-muted">{t(RELAX.safety)}</p>
    </div>
  );
}
