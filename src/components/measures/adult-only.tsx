"use client";
import type * as React from "react";
import { useSession } from "@/state/session";
import { ChoiceGroup } from "@/components/ui/choice-group";
import { Under18Notice } from "@/components/symptoms/under18-notice";
import { AGE_CHOICES } from "@/components/symptoms/symptom-meta";

/**
 * Adult-only gate (G12). When the session says the client is under 18, adult measures, their blank
 * forms and their scoring are not shown; the clinician sees the under-18 notice (referral links) and
 * the same age toggle as the Symptom Finder instead.
 */
export function AdultOnly({
  children,
  compact = false,
}: {
  children: React.ReactNode;
  /** Short notice without the toggle (for side panels). */
  compact?: boolean;
}) {
  const { state, set } = useSession();
  if (!state.under18) return <>{children}</>;
  if (compact) {
    return (
      <p className="rounded-lg bg-warn-bg p-3 text-sm font-medium text-warn-fg">
        Adult content only: adult measures and their blank forms are not shown for clients under 18.
      </p>
    );
  }
  return (
    <div className="space-y-4">
      <Under18Notice />
      <ChoiceGroup
        legend="Client is under 18"
        name="age-measures"
        value={state.under18 ? "minor" : "adult"}
        options={AGE_CHOICES}
        onChange={(v) => set({ under18: v === "minor" })}
      />
    </div>
  );
}
