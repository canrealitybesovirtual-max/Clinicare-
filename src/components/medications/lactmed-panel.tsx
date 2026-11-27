"use client";
/**
 * LactMed record links for one curated medication (clinician mode, education only). Loads only when the clinician
 * asks, because NCBI's E-utilities limit is shared with PubMed. Sends only the curated medication id to our own
 * /api/lactmed route; the server sends the curated ingredient names to NCBI. Shows record titles and NCBI links
 * only, never record text. On an error, links to the LactMed home page on NCBI.
 */
import * as React from "react";
import { Baby, Loader2 } from "lucide-react";
import { callApi } from "@/lib/api-client";
import type { LactMedResult } from "@/server/integrations/lactmed";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ExternalLink } from "@/components/ui/external-link";
import { Notice } from "@/components/ui/notice";
import { lookupErrorCopy } from "./use-live-lookup";

/** LactMed on the NCBI Bookshelf (fallback link-out). */
export const LACTMED_HOME = "https://www.ncbi.nlm.nih.gov/books/NBK501922/";

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ok"; data: LactMedResult; attribution: string }
  | { status: "error"; code: string; message: string; fallbackUrl: string };

export function LactMedPanel({ drug, name }: { drug: string; name: string }) {
  const [state, setState] = React.useState<State>({ status: "idle" });
  const abort = React.useRef<AbortController | null>(null);
  React.useEffect(() => () => abort.current?.abort(), []);

  const load = async () => {
    abort.current?.abort();
    const ac = new AbortController();
    abort.current = ac;
    setState({ status: "loading" });
    const res = await callApi<LactMedResult>("lactmed", { drug }, ac.signal);
    if (ac.signal.aborted) return;
    if (res.ok) {
      setState({ status: "ok", data: res.data, attribution: res.attribution });
    } else {
      const raw = res as { code?: string; error?: string; fallbackUrl?: unknown };
      const fallbackUrl = typeof raw.fallbackUrl === "string" && raw.fallbackUrl.startsWith("https://") ? raw.fallbackUrl : LACTMED_HOME;
      setState({ status: "error", code: raw.code ?? "upstream", message: raw.error ?? "", fallbackUrl });
    }
  };

  return (
    <section aria-labelledby="lactmed-heading" aria-busy={state.status === "loading" || undefined}>
      <Card className="space-y-3">
        <h2 id="lactmed-heading" className="flex items-center gap-2 text-lg font-semibold">
          <Baby aria-hidden className="size-5 text-accent" />
          Breastfeeding: LactMed
        </h2>
        <p className="text-sm text-muted">Education only: discuss with the prescriber. Only the medicine name is sent to NCBI.</p>
        <p role="status" aria-live="polite" className="sr-only">
          {state.status === "loading" ? "Loading LactMed records." : state.status === "ok" ? "LactMed records loaded." : ""}
        </p>
        {state.status === "idle" ? (
          <Button type="button" variant="outline" onClick={() => void load()}>
            Find LactMed records for {name}
          </Button>
        ) : null}
        {state.status === "loading" ? (
          <p className="flex items-center gap-2 text-sm text-muted">
            <Loader2 aria-hidden className="size-4 animate-spin" /> Loading LactMed records…
          </p>
        ) : null}
        {state.status === "error" ? (
          <Notice tone={state.code === "not-configured" ? "info" : "warn"} title={lookupErrorCopy(state.code, state.message).title}>
            <p>
              <ExternalLink href={state.fallbackUrl} className="inline-flex min-h-11 items-center">
                Open LactMed on NCBI
              </ExternalLink>
            </p>
          </Notice>
        ) : null}
        {state.status === "ok" ? (
          state.data.records.length ? (
            <ul className="space-y-1 text-sm">
              {state.data.records.map((r) => (
                <li key={r.url}>
                  <ExternalLink href={r.url} className="inline-flex min-h-11 items-center">
                    {r.title}
                  </ExternalLink>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm">
              No LactMed record matched.{" "}
              <ExternalLink href={state.data.lactmedUrl} className="inline-flex min-h-11 items-center">
                Search LactMed on NCBI
              </ExternalLink>
            </p>
          )
        ) : null}
        {state.status === "ok" ? <p className="border-t border-border pt-3 text-xs text-muted">{state.attribution}</p> : null}
      </Card>
    </section>
  );
}
