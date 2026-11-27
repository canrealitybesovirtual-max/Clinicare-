"use client";
import * as React from "react";
import { Play, Square } from "lucide-react";
import { fill, useT } from "@/lib/i18n/core";
import { Button } from "@/components/ui/button";
import { ChoiceGroup } from "@/components/ui/choice-group";
import { cn } from "@/lib/utils";
import { BREATHE, BREATH_PACES, CALM, DEFAULT_PACE, type BreathPaceId } from "./calm-text";
import { breathState } from "./pacing";
import { useReducedMotion } from "./use-reduced-motion";
import { useTicker } from "./use-ticker";

const FIVE_MINUTES = 5 * 60_000;

/**
 * Breathing pacer. With motion allowed, a circle grows while breathing in and shrinks while breathing out, over the
 * exact phase length. With reduced motion, a large text countdown replaces the animation. The phase name is a polite
 * live region, so screen-reader users can follow along; the countdown itself is not announced.
 */
export function BreathingPacer() {
  const t = useT();
  const reduced = useReducedMotion();
  const [paceId, setPaceId] = React.useState<BreathPaceId>(DEFAULT_PACE);
  const pace = BREATH_PACES.find((p) => p.id === paceId)!;
  const ticker = useTicker(200);
  const s = breathState(ticker.elapsedMs, pace.inhale, pace.exhale);
  const expanded = ticker.running && s.phase === "in";

  return (
    <div className="space-y-5">
      <div className="flex flex-col items-center gap-3 rounded-3xl bg-accent-soft px-4 py-6">
        {/* Same height either way, so switching after hydration (or a settings change) never shifts the page. */}
        <div className="flex h-40 items-center justify-center sm:h-48" aria-hidden>
          {reduced ? (
            <p className="font-mono text-7xl font-bold tabular-nums text-accent">{ticker.running ? s.secondsLeft : "–"}</p>
          ) : (
            <div
              className={cn("size-40 rounded-full border-4 border-accent bg-surface/70 sm:size-48", !ticker.running && "opacity-70")}
              style={{
                transform: `scale(${expanded ? 1 : 0.55})`,
                transition: ticker.running ? `transform ${expanded ? pace.inhale : pace.exhale}s ease-in-out` : "none",
              }}
            />
          )}
        </div>
        <p aria-live="polite" className="min-h-8 text-center text-2xl font-semibold text-text">
          {ticker.running ? t(s.phase === "in" ? BREATHE.breatheIn : BREATHE.breatheOut) : t(BREATHE.ready)}
        </p>
        {ticker.running ? <p className="text-sm text-muted">{fill(t(BREATHE.breaths), { n: s.breaths })}</p> : null}
        <Button
          type="button"
          size="lg"
          variant={ticker.running ? "outline" : "accent"}
          onClick={ticker.running ? ticker.reset : ticker.start}
          className="min-w-40"
        >
          {ticker.running ? <Square aria-hidden /> : <Play aria-hidden />}
          {t(ticker.running ? CALM.stop : CALM.start)}
        </Button>
      </div>

      <p className="text-base leading-relaxed text-muted">{t(reduced ? BREATHE.whyReduced : BREATHE.why)}</p>
      {ticker.elapsedMs >= FIVE_MINUTES ? <p className="text-center text-base">{t(BREATHE.fiveMinutes)}</p> : null}

      <ChoiceGroup
        legend={t(BREATHE.pace)}
        hint={t(BREATHE.paceHint)}
        name="breath-pace"
        value={paceId}
        options={BREATH_PACES.map((p) => ({
          value: p.id,
          label: t(BREATHE.paceOption).replace("{in}", String(p.inhale)).replace("{out}", String(p.exhale)),
        }))}
        onChange={(id) => {
          setPaceId(id);
          if (ticker.running) ticker.start();
        }}
      />
      <p className="text-sm text-muted">{t(BREATHE.safety)}</p>
    </div>
  );
}
