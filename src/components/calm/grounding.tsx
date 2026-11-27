"use client";
import * as React from "react";
import { ArrowLeft, ArrowRight, RotateCcw } from "lucide-react";
import { fill, useT } from "@/lib/i18n/core";
import { Button } from "@/components/ui/button";
import { CALM, GROUND, GROUND_STEPS } from "./calm-text";

/** 5-4-3-2-1 grounding, one sense at a time. Focus moves to each new step's heading. Nothing is typed. */
export function Grounding() {
  const t = useT();
  const [step, setStep] = React.useState(0);
  const headingRef = React.useRef<HTMLHeadingElement>(null);
  const done = step >= GROUND_STEPS.length;
  const current = GROUND_STEPS[step];
  const moved = React.useRef(false);

  React.useEffect(() => {
    if (moved.current) headingRef.current?.focus();
  }, [step]);
  const go = (n: number) => {
    moved.current = true;
    setStep(n);
  };

  return (
    <div className="space-y-5">
      <p className="text-base leading-relaxed text-muted">{t(GROUND.why)}</p>
      <div className="rounded-3xl bg-accent-soft px-5 py-6">
        {done || !current ? (
          <div className="space-y-3 text-center">
            <h3 ref={headingRef} tabIndex={-1} className="text-2xl font-semibold outline-none">
              {t(GROUND.doneTitle)}
            </h3>
            <p className="text-base leading-relaxed">{t(GROUND.done)}</p>
            <Button type="button" size="lg" variant="outline" onClick={() => go(0)}>
              <RotateCcw aria-hidden />
              {t(CALM.again)}
            </Button>
          </div>
        ) : (
          <div className="space-y-3 text-center">
            <p className="text-sm font-semibold text-accent">
              {fill(t(GROUND.stepOf), { n: step + 1, total: GROUND_STEPS.length })}
            </p>
            <p className="font-mono text-7xl font-bold leading-none text-accent" aria-hidden>
              {current.count}
            </p>
            <h3 ref={headingRef} tabIndex={-1} className="text-2xl font-semibold outline-none">
              {t(current.title)}
            </h3>
            <p className="mx-auto max-w-md text-lg leading-relaxed">{t(current.body)}</p>
            <div className="flex flex-wrap justify-center gap-2 pt-1">
              <Button type="button" size="lg" variant="ghost" onClick={() => go(step - 1)} disabled={step === 0}>
                <ArrowLeft aria-hidden />
                {t(CALM.back)}
              </Button>
              <Button type="button" size="lg" variant="accent" onClick={() => go(step + 1)} className="min-w-36">
                {t(CALM.next)}
                <ArrowRight aria-hidden />
              </Button>
            </div>
          </div>
        )}
      </div>
      <p className="text-sm text-muted">{t(GROUND.skip)}</p>
    </div>
  );
}
