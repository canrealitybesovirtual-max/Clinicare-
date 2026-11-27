import type * as React from "react";
import { CircleHelp } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Plain-language "What is this?" help: a native <details> with a 44px summary. Server-safe (no client JS);
 * closed by default so the tool itself stays at the top of the screen on phones.
 */
export function HelpTip({
  title = "What is this?",
  children,
  className,
}: {
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <details className={cn("group max-w-3xl rounded-xl border border-border bg-surface", className)}>
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 py-2 text-sm font-semibold text-accent [&::-webkit-details-marker]:hidden">
        <CircleHelp aria-hidden className="size-4 shrink-0" />
        <span className="underline underline-offset-2">{title}</span>
      </summary>
      <div className="space-y-2 px-4 pb-4 text-sm leading-relaxed text-text">{children}</div>
    </details>
  );
}
