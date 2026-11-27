"use client";
import * as React from "react";
import { Type } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** In-session script with a large-text "read-aloud" view for reading to the client across the room or on a tablet. */
export function ScriptReader({ script, headingId }: { script: string[]; headingId: string }) {
  const [large, setLarge] = React.useState(false);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">Original wording; adapt it to the client’s language and pace.</p>
        <Button type="button" variant="outline" aria-pressed={large} onClick={() => setLarge((v) => !v)}>
          <Type aria-hidden />
          Read-aloud view (large text)
        </Button>
      </div>
      <ol
        aria-labelledby={headingId}
        className={cn(
          "space-y-3 rounded-xl border border-border bg-surface-2 p-4",
          large ? "space-y-6 p-5 text-2xl leading-relaxed sm:p-8 sm:text-3xl" : "text-base leading-relaxed",
        )}
      >
        {script.map((line, i) => (
          <li key={i} className="max-w-prose">
            {line}
          </li>
        ))}
      </ol>
    </div>
  );
}
