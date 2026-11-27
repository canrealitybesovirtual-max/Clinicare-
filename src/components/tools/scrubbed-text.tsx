"use client";
import * as React from "react";
import { useScrubbedField } from "@/components/symptoms/use-scrubbed-field";
import { PRIVATE_TEXT_FIELD_PROPS } from "@/components/ui/private-field";
import { Notice } from "@/components/ui/notice";
import { cn } from "@/lib/utils";
import type { RegisterFlush } from "./use-latest";

/**
 * Free-text field for the tools (G5): the raw value stays in this component until the PHI scrubber has run (about
 * half a second after typing stops, on blur, or when an export flushes it); only scrubbed text reaches `onCommit`.
 * Browser spellcheck and writing assistants are opted out (PRIVATE_TEXT_FIELD_PROPS).
 */
export function ScrubbedText({
  id,
  label,
  hint,
  value,
  onCommit,
  register,
  rows = 4,
  maxLength,
  className,
  heading,
}: {
  id: string;
  label: string;
  hint?: string;
  value: string;
  onCommit: (clean: string) => void;
  register?: RegisterFlush;
  rows?: number;
  maxLength?: number;
  className?: string;
  /** Render the label inside a heading, so the field's title is in the page outline. */
  heading?: "h2" | "h3";
}) {
  const field = useScrubbedField<HTMLTextAreaElement>(value, onCommit);
  const hintId = `${id}-hint`;
  React.useEffect(() => register?.(field.flushNow), [register, field.flushNow]);
  const Heading = heading;
  const labelEl = (
    <label htmlFor={id} className="block text-base font-semibold">
      {label}
    </label>
  );

  return (
    <div className={cn("space-y-1.5", className)}>
      {Heading ? <Heading>{labelEl}</Heading> : labelEl}
      {hint ? (
        <p id={hintId} className="text-sm text-muted">
          {hint}
        </p>
      ) : null}
      <textarea
        id={id}
        ref={field.ref}
        aria-describedby={hint ? hintId : undefined}
        value={field.draft}
        maxLength={maxLength}
        rows={rows}
        onChange={(e) => field.setDraft(e.target.value)}
        onBlur={field.onBlur}
        {...PRIVATE_TEXT_FIELD_PROPS}
        className="block w-full resize-y rounded-xl border border-input-border bg-surface px-3 py-2.5 text-base leading-relaxed text-text"
      />
      <div role="alert">
        {field.removed ? (
          <Notice key={field.alertKey} tone="warn" title="Possible identifiers removed">
            <p>
              Replaced with placeholders: {field.removed.map((r) => (r.count > 1 ? `${r.label} (${r.count})` : r.label)).join(", ")}.
              Please do not type names, dates, places or contact details.
            </p>
            <button
              type="button"
              onClick={() => {
                field.dismissRemoved();
                field.ref.current?.focus();
              }}
              className="inline-flex min-h-11 items-center rounded-md text-sm font-semibold underline underline-offset-2"
            >
              Dismiss
            </button>
          </Notice>
        ) : null}
      </div>
    </div>
  );
}
