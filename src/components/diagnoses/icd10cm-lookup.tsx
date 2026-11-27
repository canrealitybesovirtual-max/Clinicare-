"use client";
/**
 * ICD-10-CM lookup (clinician mode) through our /api/icd10cm route (NLM Clinical Table Search Service).
 * Two ways in, and only these values ever leave the browser (G5, G17):
 * - a code or code prefix typed in a field that goes through the PHI scrubber (useScrubbedField) and must then
 *   pass the Icd10CmCode validator (letters, digits, one dot), or
 * - a curated term chosen from a list built server-side from the knowledge base.
 * Nothing is fetched until the clinician presses "Look up". Field text stays in this component (memory only) and
 * clears on Clear session / idle wipe (remount on resetCount).
 */
import * as React from "react";
import { Search } from "lucide-react";
import type { Icd10cmResult } from "@/server/integrations/nlm-icd10cm";
import { Icd10CmCode } from "@/lib/outbound";
import { scrubPHI } from "@/lib/phi-scrubber";
import { PART2_NOTICE } from "@/lib/referral-links";
import { useSession } from "@/state/session";
import { useScrubbedField } from "@/components/symptoms/use-scrubbed-field";
import { PRIVATE_TEXT_FIELD_PROPS } from "@/components/ui/private-field";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ChoiceGroup } from "@/components/ui/choice-group";
import { Notice } from "@/components/ui/notice";
import { HubPrompt } from "@/components/hub/hub-prompt";
import { useLookup } from "./live-lookup";
import { Attribution, LookupError, LookupLoading } from "./lookup-status";

const CDC_BROWSER = { href: "https://icd10cmtool.cdc.gov/", label: "Open the CDC ICD-10-CM Browser Tool" };

type Mode = "code" | "term";
const MODES = [
  { value: "code", label: "Code" },
  { value: "term", label: "Curated term" },
] as const;

const inputClass =
  "mt-1.5 block min-h-11 w-full rounded-lg border border-border bg-surface px-3 text-base text-text aria-[invalid=true]:border-crisis sm:text-sm";

export function Icd10cmLookup({ terms }: { terms: readonly string[] }) {
  const { resetCount } = useSession();
  return <LookupInner key={resetCount} terms={terms} />;
}

function LookupInner({ terms }: { terms: readonly string[] }) {
  const [mode, setMode] = React.useState<Mode>("code");
  const [code, setCode] = React.useState("");
  const field = useScrubbedField<HTMLInputElement>(code, setCode);
  const [term, setTerm] = React.useState("");
  const [query, setQuery] = React.useState<{ code: string } | { term: string } | null>(null);
  const [problem, setProblem] = React.useState<string | null>(null);
  const { state, retry } = useLookup<Icd10cmResult>("icd10cm", query);
  const ids = { code: React.useId(), hint: React.useId(), err: React.useId(), term: React.useId() };

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setProblem(null);
    if (mode === "code") {
      const clean = scrubPHI(field.draft).clean;
      field.flushNow();
      const parsed = Icd10CmCode.safeParse(clean);
      if (!parsed.success) {
        setProblem("Enter an ICD-10-CM code or prefix, for example F41 or F41.1.");
        return;
      }
      setQuery({ code: parsed.data });
    } else {
      if (!terms.includes(term)) {
        setProblem("Choose a term from the list.");
        return;
      }
      setQuery({ term });
    }
  }

  return (
    <section aria-labelledby="icd10-lookup-heading" className="mt-8">
      <Card className="space-y-4">
        <div>
          <h2 id="icd10-lookup-heading" className="text-lg font-semibold">
            ICD-10-CM code lookup
          </h2>
          <p className="mt-1 text-sm text-muted">
            Check codes and official titles against the current code set. Only a code or a curated term is sent, never
            what you typed elsewhere. Coding is your decision; a lookup is not a diagnosis.
          </p>
        </div>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <ChoiceGroup
            legend="Look up by"
            name="icd10-mode"
            value={mode}
            options={MODES}
            onChange={(v) => {
              setMode(v);
              setProblem(null);
            }}
            className="max-w-sm"
          />
          {mode === "code" ? (
            <div>
              <label htmlFor={ids.code} className="text-sm font-semibold">
                ICD-10-CM code or prefix
              </label>
              <p id={ids.hint} className="mt-0.5 text-xs text-muted">
                Letters, digits and one dot only, for example F41.1. Anything that looks like an identifier is removed.
              </p>
              <input
                id={ids.code}
                ref={field.ref}
                type="text"
                inputMode="text"
                maxLength={8}
                value={field.draft}
                onChange={(e) => field.setDraft(e.target.value)}
                onBlur={field.flushNow}
                aria-describedby={problem ? `${ids.hint} ${ids.err}` : ids.hint}
                aria-invalid={problem ? true : undefined}
                {...PRIVATE_TEXT_FIELD_PROPS}
                className={`${inputClass} max-w-xs font-mono uppercase`}
              />
              <div role="alert">
                {field.removed ? (
                  <p className="mt-2 text-sm font-medium text-warn-fg">
                    Possible identifier removed ({field.removed.map((r) => r.label).join(", ")}).
                  </p>
                ) : null}
              </div>
            </div>
          ) : (
            <div>
              <label htmlFor={ids.term} className="text-sm font-semibold">
                Curated term
              </label>
              <select
                id={ids.term}
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                aria-describedby={problem ? ids.err : undefined}
                aria-invalid={problem ? true : undefined}
                className={`${inputClass} max-w-lg`}
              >
                <option value="">Choose a term</option>
                {terms.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          )}
          <p id={ids.err} role="alert" className="text-sm font-medium text-crisis empty:hidden">
            {problem ?? ""}
          </p>
          <Button type="submit" variant="primary">
            <Search aria-hidden />
            Look up
          </Button>
        </form>

        <div aria-live="polite" aria-busy={state.status === "loading" || undefined}>
          {state.status === "idle" ? null : state.status === "loading" ? (
            <LookupLoading what="ICD-10-CM codes" />
          ) : state.status === "error" ? (
            <LookupError state={state} onRetry={retry} fallback={CDC_BROWSER} />
          ) : (
            <div className="space-y-3">
              <p className="text-sm font-semibold">
                {state.data.items.length === 0
                  ? "No matching ICD-10-CM codes."
                  : `${state.data.items.length} of ${state.data.total} matching code${state.data.total === 1 ? "" : "s"}`}
              </p>
              {state.data.sud ? (
                <>
                  <HubPrompt context="sud" />
                  <Notice tone="warn" title="42 CFR Part 2">
                    {PART2_NOTICE}
                  </Notice>
                </>
              ) : null}
              {state.data.items.length ? (
                <ul className="divide-y divide-border rounded-lg border border-border">
                  {state.data.items.map((i) => (
                    <li key={i.code} className="flex flex-wrap gap-x-3 px-3 py-2 text-sm">
                      <span className="font-mono font-semibold">{i.code}</span>
                      <span className="min-w-0 flex-1">{i.name}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              <Attribution text={state.attribution} source={state.source} />
            </div>
          )}
        </div>
      </Card>
    </section>
  );
}
