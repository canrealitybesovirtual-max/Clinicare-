"use client";
import * as React from "react";
import { Eraser, LockKeyhole, TimerReset, X } from "lucide-react";
import { useSession } from "@/state/session";
import { Button } from "@/components/ui/button";

/**
 * Persistent PHI banner (G5) + "Clear session" + the idle-cleared notice.
 * The status messages never repeat anything that was typed.
 */
export function PrivacyBar({ client = false }: { client?: boolean }) {
  const { reset, idleCleared, dismissIdleNotice } = useSession();
  const [cleared, setCleared] = React.useState(false);

  React.useEffect(() => {
    if (!cleared) return;
    const t = setTimeout(() => setCleared(false), 4000);
    return () => clearTimeout(t);
  }, [cleared]);

  return (
    <div className="no-print">
      <div className="border-t border-border bg-info-bg text-info-fg">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2">
          <p className="flex min-w-0 flex-1 basis-64 items-start gap-2 text-xs leading-relaxed sm:text-sm">
            <LockKeyhole aria-hidden className="mt-0.5 size-4 shrink-0" />
            <span>
              {client ? (
                <>
                  <strong>Please do not type your name or other personal details.</strong> Nothing here is saved, and it
                  clears when you close the tab or after 15 minutes idle.
                </>
              ) : (
                <>
                  <strong>Do not enter names or identifying details.</strong> Text stays on this device, is never saved,
                  and is cleared when you close the tab or after 15 minutes idle.
                </>
              )}
            </span>
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-h-10 border-info-fg/25 bg-surface"
            onClick={() => {
              reset();
              dismissIdleNotice();
              setCleared(true);
            }}
          >
            <Eraser aria-hidden />
            Clear session
          </Button>
        </div>
      </div>
      <div role="status" aria-live="polite">
        {cleared ? (
          <div className="border-t border-border bg-accent-soft text-text">
            <p className="mx-auto max-w-6xl px-4 py-2 text-sm">Session cleared. Nothing was saved.</p>
          </div>
        ) : null}
        {idleCleared ? (
          <div className="border-t border-warn-border bg-warn-bg text-warn-fg">
            <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2">
              <TimerReset aria-hidden className="size-4 shrink-0" />
              <p className="flex-1 text-sm">
                Your session was cleared after 15 minutes without activity. Nothing was saved.
              </p>
              <button
                type="button"
                onClick={dismissIdleNotice}
                className="inline-flex size-10 items-center justify-center rounded-lg hover:bg-surface/60"
                aria-label="Dismiss notice"
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
