import type { Metadata } from "next";
import { clientMetadata } from "@/components/client/client-metadata";

/** Client mode: client-worded page metadata (the shell itself comes from the root layout). */
export const metadata: Metadata = clientMetadata();

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  return children;
}
