"use client";
import type * as React from "react";
import { ShieldAlert } from "lucide-react";
import type { RedFlagType, Symptom } from "@/lib/schemas";
import { licenses } from "@/lib/content";
import { CrisisInline } from "@/components/crisis/crisis-panel";
import { ExternalLink } from "@/components/ui/external-link";

const CSSRS_URL = licenses.items["C-SSRS"]?.source ?? "https://cssrs.columbia.edu";

const GUIDANCE: Record<RedFlagType, { title: string; body: React.ReactNode; crisis?: boolean }> = {
  suicidality: {
    title: "Possible suicide risk noted",
    crisis: true,
    body: (
      <>
        Screen directly (for example, with the{" "}
        <ExternalLink href={CSSRS_URL}>C-SSRS</ExternalLink> — external, license pending) and safety-plan per your clinical
        judgment and local protocol.
      </>
    ),
  },
  homicidality: {
    title: "Possible risk of harm to others noted",
    body: "Duty-to-warn and duty-to-protect rules vary by jurisdiction. Assess directly, consult a supervisor, your licensing board guidance or legal counsel, and follow local protocol.",
  },
  psychosis: {
    title: "Possible psychotic symptoms noted",
    body: "Consider an urgent psychiatric evaluation. The conditions in this tool do not account for psychotic features.",
  },
  mania: {
    title: "Possible manic or hypomanic symptoms noted",
    body: "Consider an urgent psychiatric evaluation, and screen for bipolar-spectrum history before treating low mood.",
  },
  "eating-disorder-medical": {
    title: "Possible eating-disorder medical risk noted",
    body: "Consider a prompt medical evaluation (for example, vital signs, electrolytes and weight trend) alongside psychological care.",
  },
  withdrawal: {
    title: "Possible alcohol or sedative withdrawal noted",
    body: "Consider an urgent medical referral: withdrawal can be medically dangerous. This app does not store or transmit substance-use information (42 CFR Part 2).",
  },
};

/**
 * Red-flag banner (G9). Appears the moment a red-flag symptom is selected or detected.
 * It prompts direct assessment; the app never decides risk.
 */
export function RedFlagBanner({ flags }: { flags: { type: RedFlagType; symptoms: Symptom[] }[] }) {
  return (
    <div role="alert">
      {flags.length > 0 ? (
        <section
          aria-label="Safety red flags"
          className="mb-6 rounded-xl border border-crisis/40 border-l-[6px] border-l-crisis bg-surface p-4 shadow-sm sm:p-5"
        >
          <p className="flex items-center gap-2 text-base font-bold text-crisis">
            <ShieldAlert aria-hidden className="size-5" />
            Safety red flag{flags.length > 1 ? "s" : ""}: assess directly
          </p>
          <ul className="mt-3 space-y-3">
            {flags.map((f) => {
              const g = GUIDANCE[f.type];
              return (
                <li key={f.type} className="text-sm leading-relaxed">
                  <p className="font-semibold text-text">{g.title}</p>
                  <p className="text-muted">
                    Based on: {f.symptoms.map((s) => s.label).join("; ")}.
                  </p>
                  <p className="mt-1 text-text">{g.body}</p>
                  {g.crisis ? <CrisisInline className="mt-1" /> : null}
                </li>
              );
            })}
          </ul>
          <p className="mt-3 border-t border-border pt-3 text-xs text-muted">
            This tool flags possible risk for your attention only. It does not assess or decide risk. Crisis numbers for
            other countries are under the Crisis help button.
          </p>
        </section>
      ) : null}
    </div>
  );
}
