import Link from "next/link";
import { Flag } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * "Report a problem with this page": opens /about/report with this item preselected. The report page has no text
 * box; only the item reference ("type/id") and a curated reason code ever leave the app (G5).
 */
export function ReportProblemLink({ type, id, className }: { type: string; id: string; className?: string }) {
  return (
    <p className={cn("text-sm", className)}>
      <Link
        href={`/about/report?item=${encodeURIComponent(`${type}/${id}`)}`}
        className="inline-flex min-h-11 items-center gap-1.5 font-semibold text-accent underline underline-offset-2"
      >
        <Flag aria-hidden className="size-4" /> Report a problem with this page
      </Link>
    </p>
  );
}
