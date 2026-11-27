import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { CircleAlert, Info, ShieldAlert, TriangleAlert, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const noticeVariants = cva("flex gap-3 rounded-xl border p-4 text-sm leading-relaxed", {
  variants: {
    tone: {
      info: "border-info-fg/20 bg-info-bg text-info-fg",
      // Body text stays in the normal text colour; only the icon and title take the warning colour.
      warn: "border-warn-border bg-warn-bg text-text",
      crisis: "border-crisis bg-surface text-text border-l-[6px]",
      neutral: "border-border bg-surface-2 text-text",
      accent: "border-accent/30 bg-accent-soft text-text",
    },
  },
  defaultVariants: { tone: "info" },
});

const ICONS: Record<NonNullable<VariantProps<typeof noticeVariants>["tone"]>, LucideIcon> = {
  info: Info,
  warn: TriangleAlert,
  crisis: ShieldAlert,
  neutral: CircleAlert,
  accent: Info,
};

export interface NoticeProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "title">,
    VariantProps<typeof noticeVariants> {
  title?: React.ReactNode;
  icon?: LucideIcon | null;
  /** Heading level for the title; defaults to a bold paragraph so it never disturbs the page outline. */
  titleAs?: "h2" | "h3" | "p";
}

/** Inline notice box. Pass role="alert" only for content that appears in response to user input. */
export function Notice({ className, tone, title, icon, titleAs = "p", children, ...props }: NoticeProps) {
  const Icon = icon === null ? null : (icon ?? ICONS[tone ?? "info"]);
  const TitleTag = titleAs;
  return (
    <div className={cn(noticeVariants({ tone }), className)} {...props}>
      {Icon ? (
        <Icon
          aria-hidden
          className={cn("mt-0.5 size-5 shrink-0", tone === "crisis" && "text-crisis", tone === "warn" && "text-warn-fg")}
        />
      ) : null}
      <div className="min-w-0 flex-1 space-y-1.5">
        {title ? (
          <TitleTag className={cn("text-sm font-semibold leading-snug", tone === "warn" && "text-warn-fg")}>{title}</TitleTag>
        ) : null}
        {children}
      </div>
    </div>
  );
}
