"use client";
import { LifeBuoy } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { CrisisPanel } from "./crisis-panel";

/**
 * Always-visible crisis button (G9). Sits in the header on wide screens and floats bottom-right,
 * within thumb reach, on small screens (html scroll-padding-bottom in globals.css keeps focused controls clear of it).
 * `inline` renders a full-width button for places that cover the page, such as the menu drawer.
 * Opens an accessible dialog with crisis numbers.
 */
export function CrisisButton({ plain = false, inline = false }: { plain?: boolean; inline?: boolean }) {
  return (
    <Dialog>
      <DialogTrigger
        className={cn(
          inline
            ? "no-print inline-flex min-h-12 w-full items-center gap-2 rounded-lg bg-crisis px-4 text-sm font-bold text-crisis-fg hover:opacity-90"
            : [
                "no-print inline-flex min-h-12 items-center gap-2 rounded-full bg-crisis px-5 text-sm font-bold text-crisis-fg shadow-md ring-2 ring-surface hover:opacity-90",
                "fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] right-4 z-40",
                // Short viewports (400% zoom, landscape phones): a smaller pill that still shows its label.
                "[@media(max-height:30rem)]:min-h-11 [@media(max-height:30rem)]:px-3 [@media(max-height:30rem)]:shadow-md",
                "lg:static lg:min-h-11 lg:rounded-lg lg:px-4 lg:shadow-none lg:ring-0",
              ],
        )}
      >
        <LifeBuoy aria-hidden className="size-5" />
        {plain ? "Get help now" : "Crisis help"}
      </DialogTrigger>
      <DialogContent
        onOpenAutoFocus={(e) => {
          // Focus the dialog itself, not the first call link, so a stray Enter never dials.
          e.preventDefault();
          (e.currentTarget as HTMLElement | null)?.focus();
        }}
      >
        <DialogTitle>{plain ? "Get help now" : "Crisis support"}</DialogTitle>
        <DialogDescription>
          {plain
            ? "Free, confidential help is available any time."
            : "Numbers for the selected country. Use your clinical judgment and local protocol."}
        </DialogDescription>
        <div className="mt-4">
          <CrisisPanel plain={plain} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
