"use client";
import type * as React from "react";
import { Check, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A tap-to-select chip (a toggle button with aria-pressed). At least 44px tall; the selected state is a tint, a ring
 * and a check mark, so it does not rely on colour alone and also shows in forced-colours mode.
 */
export function ChipToggle({
  pressed,
  onToggle,
  children,
}: {
  pressed: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const Icon = pressed ? Check : Plus;
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onToggle}
      className={cn(
        "inline-flex min-h-11 max-w-full items-center gap-1.5 rounded-full border px-3.5 py-2 text-left text-sm leading-snug transition-colors",
        pressed
          ? "border-primary bg-primary/10 font-semibold text-text ring-2 ring-primary dark:bg-primary/20 forced-colors:outline forced-colors:outline-2"
          : "border-border bg-surface text-text hover:bg-surface-2",
      )}
    >
      <Icon aria-hidden className={cn("size-4 shrink-0", pressed ? "text-primary" : "text-muted")} />
      <span className="min-w-0 break-words">{children}</span>
    </button>
  );
}
