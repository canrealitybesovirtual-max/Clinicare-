"use client";
import * as React from "react";

/**
 * Elapsed milliseconds from the device clock (stays right when the tab is throttled), with pause and resume.
 * Ticks only while running. Nothing is stored.
 */
export function useTicker(intervalMs = 200) {
  const [since, setSince] = React.useState<number | null>(null);
  const [banked, setBanked] = React.useState(0);
  const [now, setNow] = React.useState(0);
  React.useEffect(() => {
    if (since === null) return;
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [since, intervalMs]);

  const elapsedMs = banked + (since === null ? 0 : Math.max(0, now - since));
  const resume = React.useCallback(() => {
    const t = Date.now();
    setSince(t);
    setNow(t);
  }, []);
  const pause = React.useCallback(() => {
    if (since === null) return;
    setBanked((b) => b + (Date.now() - since));
    setSince(null);
  }, [since]);
  const reset = React.useCallback(() => {
    setSince(null);
    setBanked(0);
    setNow(0);
  }, []);
  const start = React.useCallback(() => {
    setBanked(0);
    resume();
  }, [resume]);
  return { running: since !== null, started: since !== null || banked > 0, elapsedMs, start, pause, resume, reset };
}
