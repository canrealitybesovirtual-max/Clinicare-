"use client";
import * as React from "react";
import { Check } from "lucide-react";
import { useScrubbedField } from "@/components/symptoms/use-scrubbed-field";
import { PRIVATE_TEXT_FIELD_PROPS } from "@/components/ui/private-field";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";

export const PLAN_TEXT_MAX = 600;

/**
 * Editable plan wording (G5). Every keystroke stays in this component until the PHI scrubber has run (about half a
 * second after typing stops, or on blur); only the scrubbed text is committed to the memory-only plan draft.
 */
export function PlanTextField({
  id,
  label,
  value,
  onCommit,
  onDone,
  autoFocus = false,
  rows = 3,
}: {
  id: string;
  label: string;
  value: string;
  onCommit: (clean: string) => void;
  onDone?: () => void;
  autoFocus?: boolean;
  rows?: number;
}) {
  const field = useScrubbedField<HTMLTextAreaElement>(value, onCommit);
  const hintId = `${id}-hint`;

  React.useEffect(() => {
    if (autoFocus) field.ref.current?.focus();
    // Focus once, when the editor opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-2">
      <label htmlFor={id} className="text-sm font-semibold">
        {label}
      </label>
      <p id={hintId} className="text-xs text-muted">
        Use the client’s own words where you can. No names, dates, places or other identifying details; likely
        identifiers are removed automatically.
      </p>
      <textarea
        id={id}
        ref={field.ref}
        aria-describedby={hintId}
        value={field.draft}
        maxLength={PLAN_TEXT_MAX}
        onChange={(e) => field.setDraft(e.target.value)}
        onBlur={field.flushNow}
        rows={rows}
        {...PRIVATE_TEXT_FIELD_PROPS}
        className="block w-full resize-y rounded-lg border border-border bg-surface px-3 py-2 text-base leading-relaxed text-text"
      />
      <div role="alert">
        {field.removed ? (
          <Notice key={field.alertKey} tone="warn" title="Possible identifiers removed">
            <p>
              Replaced with placeholders: {field.removed.map((r) => (r.count > 1 ? `${r.label} (${r.count})` : r.label)).join(", ")}.
              Please do not enter identifying details.
            </p>
            <button
              type="button"
              onClick={field.dismissRemoved}
              className="inline-flex min-h-11 items-center rounded-md text-sm font-semibold underline underline-offset-2"
            >
              Dismiss
            </button>
          </Notice>
        ) : null}
      </div>
      {onDone ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-h-11"
          onClick={() => {
            field.flushNow();
            onDone();
          }}
        >
          <Check aria-hidden />
          Done editing
        </Button>
      ) : null}
    </div>
  );
}
