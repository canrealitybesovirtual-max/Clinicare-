import type * as React from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageIntro } from "@/components/content/content-bits";

/** Page heading for a tool: a 44px "All tools" link, then the title. The description hides on phones. */
export function ToolIntro({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <>
      <Link href="/tools" className="-mt-2 mb-1 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-accent">
        <ArrowLeft aria-hidden className="size-4" />
        All tools
      </Link>
      <PageIntro title={title} compact>
        {children}
      </PageIntro>
    </>
  );
}
