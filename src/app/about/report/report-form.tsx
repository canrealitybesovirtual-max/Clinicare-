"use client";
import * as React from "react";
import { Check, Mail, SquareArrowOutUpRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { NewTabHint } from "@/components/ui/new-tab-hint";
import { Notice } from "@/components/ui/notice";
import { cn } from "@/lib/utils";
import { REPORT_REASONS, reportHref, type ReportDestination, type ReportReason } from "./report-link";

export interface ReportGroup {
  type: string;
  label: string;
  items: readonly { ref: string; title: string }[];
}

const selectClass = "block min-h-11 w-full rounded-xl border border-input-border bg-surface px-3 text-base text-text";

/**
 * Pick one curated item and one curated reason; the link that comes out carries only those two. There is no
 * free-text field anywhere on this form, so nothing typed can reach the report (G5). State lives in memory only.
 */
export function ReportForm({
  groups,
  destination,
  initialRef,
}: {
  groups: readonly ReportGroup[];
  destination: ReportDestination | null;
  initialRef?: string;
}) {
  const ids = { type: React.useId(), item: React.useId() };
  const initialType = groups.find((g) => g.items.some((i) => i.ref === initialRef))?.type ?? groups[0]?.type ?? "";
  const [type, setType] = React.useState(initialType);
  const [ref, setRef] = React.useState(initialRef ?? "");
  const [reason, setReason] = React.useState<ReportReason | "">("");

  const group = groups.find((g) => g.type === type);
  const item = group?.items.find((i) => i.ref === ref);
  const href = destination && item && reason ? reportHref(destination, item.ref, reason) : null;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor={ids.type} className="text-sm font-semibold">
            1. Kind of content
          </label>
          <select
            id={ids.type}
            value={type}
            onChange={(e) => {
              setType(e.target.value);
              setRef("");
            }}
            className={selectClass}
          >
            {groups.map((g) => (
              <option key={g.type} value={g.type}>
                {g.label} ({g.items.length})
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label htmlFor={ids.item} className="text-sm font-semibold">
            2. Item
          </label>
          <select id={ids.item} value={ref} onChange={(e) => setRef(e.target.value)} className={selectClass}>
            <option value="">Choose an item</option>
            {group?.items.map((i) => (
              <option key={i.ref} value={i.ref}>
                {i.title}
              </option>
            ))}
          </select>
        </div>
      </div>

      <fieldset className="min-w-0">
        <legend className="mb-2 text-sm font-semibold">
          3. What is the problem?
        </legend>
        <div className="grid gap-2 lg:grid-cols-2">
          {REPORT_REASONS.map((r) => (
            <label
              key={r.code}
              className={cn(
                "group flex min-h-11 cursor-pointer items-start gap-2 rounded-xl border border-border bg-surface px-3 py-2.5 text-sm leading-snug hover:bg-surface-2",
                "has-[:checked]:border-primary has-[:checked]:bg-primary/10 has-[:checked]:ring-2 has-[:checked]:ring-primary dark:has-[:checked]:bg-primary/20",
                "has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--focus)]",
              )}
            >
              <input type="radio" className="sr-only" name="report-reason" value={r.code} checked={reason === r.code} onChange={() => setReason(r.code)} />
              <span
                aria-hidden
                className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border border-input-border group-has-[:checked]:border-primary group-has-[:checked]:bg-primary-solid"
              >
                <Check className="hidden size-3 text-primary-solid-fg group-has-[:checked]:block" />
              </span>
              <span className="min-w-0">{r.label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="rounded-2xl border border-border bg-surface-2 p-4 text-sm sm:p-5" aria-live="polite">
        <p className="font-semibold">The report will contain only</p>
        <dl className="mt-2 grid gap-x-3 gap-y-1 sm:grid-cols-[auto_1fr]">
          <dt className="text-muted">Item</dt>
          <dd className="break-words font-mono text-xs leading-5">{item ? item.ref : "not chosen yet"}</dd>
          <dt className="text-muted">Reason</dt>
          <dd className="font-mono text-xs leading-5">{reason || "not chosen yet"}</dd>
        </dl>
      </div>

      {destination ? (
        href ? (
          <a
            href={href}
            className={cn(buttonVariants({ variant: "primary", size: "lg" }), "w-full sm:w-auto")}
            {...(destination.kind === "url" ? { target: "_blank", rel: "noopener noreferrer" } : {})}
          >
            {destination.kind === "email" ? <Mail aria-hidden /> : <SquareArrowOutUpRight aria-hidden />}
            {destination.kind === "email" ? "Open an email with this report" : "Open the report form"}
            {destination.kind === "url" ? <NewTabHint /> : null}
          </a>
        ) : (
          <p className="text-sm text-muted">Choose an item and a reason to make the report link.</p>
        )
      ) : (
        <Notice tone="neutral" title="No report address is set up for this copy of the app">
          <p>
            Send the item and reason shown above to the person or organization that gave you access. Leave out any client
            information.
          </p>
        </Notice>
      )}
    </div>
  );
}
