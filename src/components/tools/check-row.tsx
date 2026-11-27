"use client";
import type * as React from "react";
import { cn } from "@/lib/utils";

/** A checkbox with a full-width, at least 44px tall label (native input, so keyboard and screen readers just work). */
export function CheckRow({
  checked,
  onChange,
  children,
  className,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label
      className={cn(
        "flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-border bg-surface px-3 py-2.5 text-sm leading-snug hover:bg-surface-2",
        "has-[:checked]:border-primary has-[:checked]:bg-primary/10 dark:has-[:checked]:bg-primary/20",
        "has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--focus)]",
        className,
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 size-5 shrink-0 accent-[var(--primary)] focus-visible:outline-none"
      />
      <span className="min-w-0">{children}</span>
    </label>
  );
}
