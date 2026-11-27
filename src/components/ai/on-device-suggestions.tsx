"use client";
/**
 * Opt-in on-device suggestions (docs/ON-DEVICE-AI.md): a small sentence-embedding model that runs in a Web Worker
 * from this app's own origin. Off by default; nothing is downloaded until the clinician turns it on. The note never
 * leaves the browser tab. Suggestions are tap-to-add symptom chips for clinician review, never added on their own.
 * If the browser cannot run WebAssembly, or the model files are not installed, it says so and everything else
 * keeps working.
 */
import * as React from "react";
import { Cpu, Trash2 } from "lucide-react";
import { getSymptom } from "@/lib/content";
import { SEMANTIC_DOWNLOAD_BYTES, SEMANTIC_SUGGESTIONS_LABEL } from "@/lib/semantic/client";
import { useSemanticModel, useSemanticSuggestions } from "@/lib/semantic/use-semantic";
import { useSession } from "@/state/session";
import { Button } from "@/components/ui/button";
import { ClinicianReviewBadge } from "@/components/content/content-bits";
import type { SymptomAnalysis } from "@/components/symptoms/analysis";
import { AddSymptomChip } from "./follow-up-panel";
import { useIsClientMode } from "./use-client-mode";

const MB = Math.round(SEMANTIC_DOWNLOAD_BYTES / 1_000_000);

export function OnDeviceSuggestions({ analysis }: { analysis: SymptomAnalysis }) {
  const client = useIsClientMode();
  const { state, toggleSymptom } = useSession();
  const model = useSemanticModel();
  const [removed, setRemoved] = React.useState<boolean | null>(null);
  const { status, progress, error } = model.state;
  const ready = status === "ready";
  const exclude = React.useMemo(
    () => [...analysis.ids, ...analysis.absent.map((a) => a.symptomId), ...analysis.folded.negatedSymptomIds],
    [analysis.ids, analysis.absent, analysis.folded.negatedSymptomIds],
  );
  const { suggestions, pending, error: suggestError } = useSemanticSuggestions(state.symptomText, { enabled: ready, exclude });
  const known = suggestions.filter((s) => getSymptom(s.symptomId));

  if (client) return null;

  const on = status === "loading" || ready;
  const unsupported = model.support.supported === false && model.support.reason !== "Checking...";
  const toggle = () => {
    setRemoved(null);
    if (on) model.disable();
    else void model.enable();
  };

  return (
    <section aria-labelledby="ondevice-heading" className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center gap-3">
        <Cpu aria-hidden className="size-5 shrink-0 text-muted" />
        <h3 id="ondevice-heading" className="min-w-0 flex-1 text-base font-semibold leading-snug">
          Suggest more symptoms on this device
        </h3>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-labelledby="ondevice-heading"
          disabled={unsupported}
          onClick={toggle}
          className="group relative inline-flex h-11 w-[4.5rem] shrink-0 items-center rounded-full border border-border bg-surface-2 p-1 disabled:opacity-50 aria-checked:border-primary aria-checked:bg-primary/15"
        >
          <span
            aria-hidden
            className="size-8 rounded-full bg-muted transition-transform motion-reduce:transition-none group-aria-checked:translate-x-7 group-aria-checked:bg-primary-solid"
          />
        </button>
      </div>
      <p className="mt-2 text-sm text-muted">
        Optional. Finds lexicon symptoms that are worded differently in your note. The model (about {MB} MB) downloads
        from this app only when you turn it on; your note never leaves this tab.
      </p>

      <div aria-live="polite" className="mt-3 space-y-3 text-sm empty:hidden">
        {unsupported ? <p className="text-muted">{model.support.supported === false ? model.support.reason : ""}</p> : null}
        {status === "loading" ? (
          <div>
            <p>Loading the on-device model{progress ? ` (${Math.round(progress.fraction * 100)}%)` : ""}…</p>
            <div
              role="progressbar"
              aria-label="On-device model download"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round((progress?.fraction ?? 0) * 100)}
              className="mt-2 h-2 overflow-hidden rounded-full bg-border/70"
            >
              <div className="h-full rounded-full bg-accent" style={{ width: `${Math.round((progress?.fraction ?? 0) * 100)}%` }} />
            </div>
          </div>
        ) : null}
        {error ? (
          <p className="rounded-lg bg-warn-bg p-3 text-text">
            {error.message} The rest of the Symptom Finder works without it.
          </p>
        ) : null}
        {ready ? (
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold">{SEMANTIC_SUGGESTIONS_LABEL}</p>
              <ClinicianReviewBadge />
            </div>
            {known.length ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {known.map((s) => (
                  <AddSymptomChip key={s.symptomId} id={s.symptomId} hint={`close to “${s.phrase}”`} onAdd={(id) => toggleSymptom(id)} />
                ))}
              </div>
            ) : (
              <p className="mt-1 text-muted">
                {!state.symptomText.trim()
                  ? "Type in the note to get suggestions."
                  : pending
                    ? "Looking…"
                    : suggestError
                      ? "The model could not read this note. The other tools still work."
                      : "No further matches above the threshold."}
              </p>
            )}
          </div>
        ) : null}
        {removed !== null ? <p className="text-muted">{removed ? "Downloaded model removed from this browser." : "No downloaded model was stored."}</p> : null}
      </div>

      {!on ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mt-2"
          onClick={() => {
            void model.clearCache().then(setRemoved);
          }}
        >
          <Trash2 aria-hidden />
          Remove downloaded model
        </Button>
      ) : null}
    </section>
  );
}
