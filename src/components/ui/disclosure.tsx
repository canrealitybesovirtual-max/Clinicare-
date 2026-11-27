import * as React from "react";
import { ChevronDown, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The one disclosure pattern (native <details>): a 48px summary row with the title, optional meta text and a
 * chevron that turns when open. The browser marker is hidden in every engine so the chevron is the only cue.
 * Server-safe (no client JS). `bordered` draws the divider used when disclosures are stacked inside a card.
 */
export function Disclosure({
  title,
  meta,
  icon: Icon,
  children,
  className,
  bodyClassName,
  bordered = true,
  defaultOpen,
  id,
}: {
  title: React.ReactNode;
  meta?: React.ReactNode;
  icon?: LucideIcon;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  bordered?: boolean;
  defaultOpen?: boolean;
  id?: string;
}) {
  return (
    <details id={id} open={defaultOpen} className={cn("group/disclosure", bordered && "border-t border-border", className)}>
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 py-2 text-sm font-semibold hover:text-accent [&::-webkit-details-marker]:hidden">
        {Icon ? <Icon aria-hidden className="size-4 shrink-0 text-muted" /> : null}
        <span className="min-w-0 flex-1">{title}</span>
        {meta ? <span className="text-xs font-normal text-muted">{meta}</span> : null}
        <ChevronDown
          aria-hidden
          className="size-4 shrink-0 text-muted transition-transform group-open/disclosure:rotate-180"
        />
      </summary>
      <div className={cn("space-y-3 pb-4 text-sm leading-relaxed", bodyClassName)}>{children}</div>
    </details>
  );
}
