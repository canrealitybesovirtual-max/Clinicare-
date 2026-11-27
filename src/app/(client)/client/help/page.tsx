import type { Metadata } from "next";
import { helpRegions } from "@/components/client/help-directory";
import { ClientHelpView } from "@/components/client/client-help-view";

export const metadata: Metadata = { title: "Where to get help" };

/* Client mode (G3, G9): crisis first, then free helplines by country, in English or Spanish. Nothing is typed or sent. */
export default function ClientHelpPage() {
  return <ClientHelpView regions={helpRegions()} />;
}
