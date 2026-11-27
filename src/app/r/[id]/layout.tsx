import type { Metadata } from "next";
import { clientMetadata } from "@/components/client/client-metadata";

/** Share links: client-worded page metadata, so a texted link's preview reads as a self-help sheet (G3). */
export const metadata: Metadata = clientMetadata();

export default function ShareLayout({ children }: { children: React.ReactNode }) {
  return children;
}
