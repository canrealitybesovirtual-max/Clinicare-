import * as React from "react";
import { ExternalLink as ExternalIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Outbound link (plain navigation only; nothing typed is ever added to the URL).
 * Always rel="noopener noreferrer" so the destination gets no referrer and no window handle.
 */
export function ExternalLink({
  href,
  children,
  className,
  showIcon = true,
  ...props
}: Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "target" | "rel"> & { href: string; showIcon?: boolean }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "font-medium text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent",
        className,
      )}
      {...props}
    >
      {children}
      {showIcon ? <ExternalIcon aria-hidden className="ml-1 inline-block size-3.5 align-[-0.125em]" /> : null}
      <span className="sr-only" lang="en">
        {" "}
        (opens in a new tab)
      </span>
    </a>
  );
}
