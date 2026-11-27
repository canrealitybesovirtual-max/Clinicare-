"use client";
import * as React from "react";
import { Eraser, Hourglass, LockKeyhole, TimerReset, X } from "lucide-react";
import { IDLE_MS, IDLE_WARNING_MS, useSession } from "@/state/session";
import { fill, useT } from "@/lib/i18n/core";
import { PRIVACY } from "@/lib/i18n/shell";
import { Button } from "@/components/ui/button";

const IDLE_MINUTES = Math.round(IDLE_MS / 60_000);
const WARNING_SECONDS = Math.round(IDLE_WARNING_MS / 1000);

/**
 * Persistent PHI banner (G5) + "Clear session" (immediate, by owner decision), the idle warning ("Keep working",
 * WCAG 2.2.1) and the idle-cleared notice. The status messages never repeat anything that was typed.
 * Phones get one short line and a short button label; the full wording (with the idle time) shows from lg and on /about.
 */
export function PrivacyBar({ client = false }: { client?: boolean }) {
  const { reset, idleCleared, dismissIdleNotice, idleWarning, extend } = useSession();
  const t = useT();
  const [cleared, setCleared] = React.useState(false);

  React.useEffect(() => {
    if (!cleared) return;
    const timer = setTimeout(() => setCleared(false), 4000);
    return () => clearTimeout(timer);
  }, [cleared]);

  return (
    <div className="no-print">
      <div className="border-t border-border bg-info-bg text-info-fg">
        <div className="mx-auto flex max-w-6xl items-center gap-x-3 px-4 py-1.5 sm:px-6 lg:py-2">
          <p className="flex min-w-0 flex-1 items-start gap-2 text-xs sm:text-sm">
            <LockKeyhole aria-hidden className="mt-0.5 size-4 shrink-0" />
            <span>
              <strong>{t(client ? PRIVACY.clientLead : PRIVACY.clinicianLead)}</strong>{" "}
              <span className="lg:hidden">{t(client ? PRIVACY.clientShort : PRIVACY.clinicianShort)}</span>
              <span className="hidden lg:inline">
                {fill(t(client ? PRIVACY.clientLong : PRIVACY.clinicianLong), { minutes: IDLE_MINUTES })}
              </span>
            </span>
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-label={t(PRIVACY.clear)}
            className="shrink-0 border-info-fg/25"
            onClick={() => {
              reset();
              dismissIdleNotice();
              setCleared(true);
            }}
          >
            <Eraser aria-hidden />
            <span className="sm:hidden">{t(PRIVACY.clearShort)}</span>
            <span className="hidden sm:inline">{t(PRIVACY.clear)}</span>
          </Button>
        </div>
      </div>
      {/* Assertive: the idle warning is time-critical. The container stays mounted so the alert is announced. */}
      <div role="alert">
        {idleWarning ? (
          <div className="border-t border-warn-border bg-warn-bg text-text">
            <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2 sm:px-6">
              <Hourglass aria-hidden className="size-4 shrink-0 text-warn-fg" />
              <p className="min-w-0 flex-1 basis-48 text-sm font-semibold">
                {fill(t(PRIVACY.idleWarning), { seconds: WARNING_SECONDS })}
              </p>
              <Button type="button" variant="outline" size="sm" onClick={extend}>
                {t(PRIVACY.keepWorking)}
              </Button>
            </div>
          </div>
        ) : null}
      </div>
      <div role="status" aria-live="polite">
        {cleared ? (
          <div className="border-t border-border bg-accent-soft text-text">
            <p className="mx-auto max-w-6xl px-4 py-2 text-sm sm:px-6">{t(PRIVACY.cleared)}</p>
          </div>
        ) : null}
        {idleCleared ? (
          <div className="border-t border-warn-border bg-warn-bg text-text">
            <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-1 sm:px-6">
              <TimerReset aria-hidden className="size-4 shrink-0 text-warn-fg" />
              <p className="flex-1 text-sm">{fill(t(PRIVACY.idleCleared), { minutes: IDLE_MINUTES })}</p>
              <button
                type="button"
                onClick={dismissIdleNotice}
                className="inline-flex size-11 items-center justify-center rounded-xl hover:bg-surface/60"
                aria-label={t(PRIVACY.dismiss)}
              >
                <X aria-hidden className="size-4" />
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
