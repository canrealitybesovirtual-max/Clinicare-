import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold", {
  variants: {
    tone: {
      neutral: "border-border bg-surface-2 text-text",
      primary: "border-transparent bg-primary-solid text-primary-solid-fg",
      accent: "border-transparent bg-accent-soft text-accent",
      warn: "border-warn-border bg-warn-bg text-warn-fg",
      info: "border-transparent bg-info-bg text-info-fg",
      crisis: "border-transparent bg-crisis text-crisis-fg",
    },
  },
  defaultVariants: { tone: "neutral" },
});

export function Badge({
  className,
  tone,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
