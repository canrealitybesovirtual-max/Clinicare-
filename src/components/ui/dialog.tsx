"use client";
import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

/** Accessible modal (Radix): focus trap, Escape to close, aria-modal, labelled by its title. */
export const DialogContent = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & { closeLabel?: string }
>(({ className, children, closeLabel = "Close", ...props }, ref) => (
  <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/55" />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        "fixed inset-x-0 bottom-0 z-50 max-h-[92dvh] overflow-y-auto rounded-t-2xl border border-border bg-surface p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] text-text shadow-2xl",
        "sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-[min(36rem,calc(100vw-2rem))] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:p-6",
        className,
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close
        className="absolute right-3 top-3 inline-flex size-11 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-text"
        aria-label={closeLabel}
      >
        <X aria-hidden className="size-5" />
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
));
DialogContent.displayName = "DialogContent";

export function DialogTitle({ className, ...props }: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title className={cn("pr-12 text-xl font-bold leading-tight", className)} {...props} />;
}

export function DialogDescription({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>) {
  return <DialogPrimitive.Description className={cn("mt-1 text-sm text-muted", className)} {...props} />;
}
