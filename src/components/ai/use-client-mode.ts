"use client";
import { usePathname } from "next/navigation";
import { isClientPath } from "@/components/layout/paths";

/**
 * True on client-facing pages (/client/**, /r/**). The AI panels name conditions and clinical features, so they
 * render nothing there (G3), even if a client page ever embeds a clinician component by mistake.
 */
export function useIsClientMode(): boolean {
  return isClientPath(usePathname());
}
