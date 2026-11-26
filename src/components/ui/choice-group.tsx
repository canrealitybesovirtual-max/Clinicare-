"use client";
import * as React from "react";
import { cn } from "@/lib/utils";

export interface Choice<V extends string> {
  value: V;
  label: string;
}

/**
 * Native radio group rendered as a segmented control (fieldset + legend, real radio inputs,
 * arrow-key navigation from the browser). Targets are at least 44px tall.
 */
export function ChoiceGroup<V extends string>({
  legend,
  hint,
  name,
  value,
  options,
  onChange,
  className,
}: {
  legend: React.ReactNode;
  hint?: React.ReactNode;
  name: string;
  value: V;
  options: readonly Choice<V>[];
  onChange: (value: V) => void;
  className?: string;
}) {
  const hintId = React.useId();
  return (
    <fieldset className={cn("min-w-0", className)} aria-describedby={hint ? hintId : undefined}>
      <legend className="mb-1.5 text-sm font-semibold text-text">{legend}</legend>
      {hint ? (
        <p id={hintId} className="-mt-0.5 mb-2 text-xs text-muted">
          {hint}
        </p>
      ) : null}
      <div className={cn("grid gap-1.5", options.length === 3 ? "grid-cols-3" : "grid-cols-2")}>
        {options.map((o) => (
          <label
            key={o.value}
            className={cn(
              "relative flex min-h-11 cursor-pointer select-none items-center justify-center rounded-lg border border-border bg-surface px-2 py-1.5 text-center text-sm leading-tight text-text transition-colors hover:bg-surface-2",
              "has-[:checked]:border-primary has-[:checked]:bg-primary has-[:checked]:font-semibold has-[:checked]:text-primary-fg",
              "has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--focus)]",
            )}
          >
            <input
              type="radio"
              className="sr-only"
              name={name}
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
            />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
