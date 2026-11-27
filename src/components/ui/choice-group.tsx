"use client";
import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Choice<V extends string> {
  value: V;
  label: string;
  /** Language of the label when it differs from the page (WCAG 3.1.2), for example "es" for "Español". */
  lang?: string;
}

/**
 * Native radio group rendered as a segmented control (fieldset + legend, real radio inputs,
 * arrow-key navigation from the browser). Targets are at least 44px tall.
 * The checked option is a light tint with a ring and a check mark (not a solid fill), so default answers such as
 * "Not recorded" never look heavier than real findings; the check mark also shows in forced-colours mode.
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
      <legend className="mb-2 text-sm font-semibold text-text">{legend}</legend>
      {hint ? (
        <p id={hintId} className="-mt-0.5 mb-2 text-xs text-muted">
          {hint}
        </p>
      ) : null}
      <div className={cn("grid gap-2", options.length === 3 ? "choice-grid-3 grid-cols-3" : "grid-cols-2")}>
        {options.map((o) => (
          <label
            key={o.value}
            className={cn(
              "group relative flex min-h-11 cursor-pointer select-none items-center justify-center gap-1.5 rounded-xl border border-border bg-surface px-2 py-1.5 text-center text-sm leading-tight text-text transition-colors hover:bg-surface-2",
              "has-[:checked]:border-primary has-[:checked]:bg-primary/10 has-[:checked]:font-semibold has-[:checked]:text-text has-[:checked]:ring-2 has-[:checked]:ring-primary dark:has-[:checked]:bg-primary/20",
              "forced-colors:has-[:checked]:outline forced-colors:has-[:checked]:outline-2 forced-colors:has-[:checked]:outline-[Highlight]",
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
            <Check aria-hidden className="hidden size-4 shrink-0 text-primary group-has-[:checked]:inline-block" />
            <span lang={o.lang} className="min-w-0 break-words">
              {o.label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
