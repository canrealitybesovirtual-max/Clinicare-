"use client";
import * as React from "react";
import { ChevronLeft, ChevronRight, Minus, Pause, Play, Plus, RotateCcw } from "lucide-react";
import {
  DEFAULT_FLOW,
  STEP_MAX_MINUTES,
  STEP_MIN_MINUTES,
  flowStatus,
  formatClock,
  plannedMs,
  spokenClock,
  type FlowStep,
} from "@/lib/tools/session-flow";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * Session flow timer. Counts from the device clock (so it stays right when the tab sleeps); steps move on only when
 * the clinician says so. Nothing is typed, stored or sent. A live region announces step changes and the end of a
 * step's planned time, never every second.
 */
export function SessionTimer() {
  const [steps, setSteps] = React.useState<FlowStep[]>(() => DEFAULT_FLOW.map((s) => ({ ...s })));
  const [index, setIndex] = React.useState(0);
  const [accumulated, setAccumulated] = React.useState(0);
  const [runningSince, setRunningSince] = React.useState<number | null>(null);
  const [stepStart, setStepStart] = React.useState(0);
  const [now, setNow] = React.useState(() => Date.now());
  const [announce, setAnnounce] = React.useState("");
  const announcedOver = React.useRef<number | null>(null);

  React.useEffect(() => {
    if (runningSince === null) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [runningSince]);

  const elapsed = accumulated + (runningSince !== null ? Math.max(0, now - runningSince) : 0);
  const step = steps[index]!;
  const status = flowStatus(steps, index, elapsed, stepStart);
  const total = plannedMs(steps);
  const over = status.stepOverMs > 0;

  React.useEffect(() => {
    if (over && announcedOver.current !== index) {
      announcedOver.current = index;
      setAnnounce(`Planned time for ${step.label} is up.`);
    }
  }, [over, index, step.label]);

  function toggle() {
    const t = Date.now();
    setNow(t);
    if (runningSince === null) {
      setRunningSince(t);
      setAnnounce(elapsed === 0 ? `Started. ${step.label}.` : "Resumed.");
    } else {
      setAccumulated((a) => a + (t - runningSince));
      setRunningSince(null);
      setAnnounce("Paused.");
    }
  }

  function go(to: number) {
    if (to < 0 || to >= steps.length) return;
    const t = Date.now();
    setNow(t);
    setIndex(to);
    setStepStart(accumulated + (runningSince !== null ? t - runningSince : 0));
    announcedOver.current = null;
    setAnnounce(`Now: ${steps[to]!.label}, ${steps[to]!.minutes} minutes planned.`);
  }

  function reset() {
    setIndex(0);
    setAccumulated(0);
    setRunningSince(null);
    setStepStart(0);
    announcedOver.current = null;
    setAnnounce("Timer reset.");
  }

  function adjust(i: number, delta: number) {
    setSteps((list) =>
      list.map((s, j) => (j === i ? { ...s, minutes: Math.min(STEP_MAX_MINUTES, Math.max(STEP_MIN_MINUTES, s.minutes + delta)) } : s)),
    );
  }

  const progress = Math.min(1, elapsed / total);

  return (
    <div className="space-y-6">
      <Card className="space-y-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm font-semibold uppercase tracking-wide text-accent">
            Step {index + 1} of {steps.length}
          </p>
          <p className="text-sm text-muted">{Math.round(total / 60_000)} minutes planned</p>
        </div>
        <div>
          <h2 className="text-2xl font-bold tracking-tight">{step.label}</h2>
          <p className="mt-1 text-base text-muted">{step.hint}</p>
        </div>
        <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
          <div role="timer" aria-label={`${over ? "Over planned time by" : "Time left in this step"}: ${spokenClock(over ? status.stepOverMs : status.stepRemainingMs)}`}>
            <p className="text-sm font-semibold text-muted">{over ? "Over planned time" : "Left in this step"}</p>
            <p className={cn("font-mono text-5xl font-bold tabular-nums leading-none", over ? "text-warn-fg" : "text-text")} aria-hidden>
              {over ? "+" : ""}
              {formatClock(over ? status.stepOverMs : status.stepRemainingMs)}
            </p>
          </div>
          <div role="timer" aria-label={`Session time left: ${spokenClock(status.sessionRemainingMs)}`}>
            <p className="text-sm font-semibold text-muted">Session left</p>
            <p className="font-mono text-2xl font-semibold tabular-nums" aria-hidden>
              {formatClock(status.sessionRemainingMs)}
            </p>
          </div>
        </div>
        {status.projectedOverMs > 0 ? (
          <p className="rounded-xl bg-warn-bg px-3 py-2 text-sm text-warn-fg">
            At this pace the session runs about {Math.ceil(status.projectedOverMs / 60_000)} min over. Shorten a later step
            if you need to.
          </p>
        ) : null}
        <div
          className="h-3 overflow-hidden rounded-full bg-surface-2"
          role="progressbar"
          aria-label="Session progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress * 100)}
        >
          <div className="h-full rounded-full bg-accent" style={{ width: `${progress * 100}%` }} />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="lg" onClick={toggle}>
            {runningSince === null ? <Play aria-hidden /> : <Pause aria-hidden />}
            {runningSince === null ? (elapsed === 0 ? "Start" : "Resume") : "Pause"}
          </Button>
          <Button type="button" size="lg" variant="outline" onClick={() => go(index + 1)} disabled={index === steps.length - 1}>
            Next step
            <ChevronRight aria-hidden />
          </Button>
          <Button type="button" size="lg" variant="ghost" onClick={() => go(index - 1)} disabled={index === 0}>
            <ChevronLeft aria-hidden />
            Back
          </Button>
          <Button type="button" size="lg" variant="ghost" onClick={reset} disabled={elapsed === 0 && index === 0}>
            <RotateCcw aria-hidden />
            Reset
          </Button>
        </div>
        <p role="status" className="sr-only">
          {announce}
        </p>
      </Card>

      <Card>
        <h2 className="text-lg font-semibold">Agenda</h2>
        <p className="mt-1 text-sm text-muted">Change the minutes to fit your session. The plan adds up to {Math.round(total / 60_000)} minutes.</p>
        <ol className="mt-4 divide-y divide-border">
          {steps.map((s, i) => (
            <li
              key={s.id}
              aria-current={i === index ? "step" : undefined}
              className={cn("flex flex-wrap items-center gap-3 py-3", i === index && "font-semibold")}
            >
              <span
                aria-hidden
                className={cn(
                  "inline-flex size-8 shrink-0 items-center justify-center rounded-full text-sm",
                  i === index ? "bg-primary-solid text-primary-solid-fg" : i < index ? "bg-accent-soft text-accent" : "bg-surface-2 text-muted",
                )}
              >
                {i + 1}
              </span>
              <span className="min-w-0 flex-1">{s.label}</span>
              <span className="flex items-center gap-1" role="group" aria-label={`${s.label}: ${s.minutes} minutes`}>
                <Button type="button" variant="ghost" size="sm" className="w-11 px-0" aria-label={`${s.label}: one minute less`} onClick={() => adjust(i, -1)} disabled={s.minutes <= STEP_MIN_MINUTES}>
                  <Minus aria-hidden />
                </Button>
                <span className="w-14 text-center text-sm tabular-nums" aria-hidden>
                  {s.minutes} min
                </span>
                <Button type="button" variant="ghost" size="sm" className="w-11 px-0" aria-label={`${s.label}: one minute more`} onClick={() => adjust(i, 1)} disabled={s.minutes >= STEP_MAX_MINUTES}>
                  <Plus aria-hidden />
                </Button>
              </span>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}
