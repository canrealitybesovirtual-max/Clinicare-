"use client";
import * as React from "react";
import Link from "next/link";
import { ArrowRight, MessageSquareHeart } from "lucide-react";
import {
  CARE_TRANSITION_GOVERNANCE,
  CARING_MESSAGES,
  CONTACT_CHANNELS,
  TRANSITION_SECTIONS,
  careTransitionDoc,
  careTransitionIncludesPart2,
  type CaringMessageId,
  type ContactChannel,
} from "@/lib/tools/care-transition";
import { DOC_PART2_NOTICE } from "@/lib/tools/doc-model";
import { useSession } from "@/state/session";
import { AdultOnly } from "@/components/measures/adult-only";
import { CrisisInline } from "@/components/crisis/crisis-panel";
import { ClinicianReviewBadge, Governance } from "@/components/content/content-meta";
import { Card } from "@/components/ui/card";
import { ChoiceGroup } from "@/components/ui/choice-group";
import { Notice } from "@/components/ui/notice";
import { CheckRow } from "./check-row";
import { ExportActions } from "./export-actions";

const toggle = <T,>(list: readonly T[], item: T, on: boolean): T[] => (on ? [...new Set([...list, item])] : list.filter((x) => x !== item));

/** Care-transition checklist and caring-contacts plan. Tick boxes only; nothing is typed, stored or sent. */
export function CareTransitionTool({ sudPrompt }: { sudPrompt: React.ReactNode }) {
  const { resetCount } = useSession();
  return (
    <AdultOnly>
      <CareTransitionInner key={resetCount} sudPrompt={sudPrompt} />
    </AdultOnly>
  );
}

function CareTransitionInner({ sudPrompt }: { sudPrompt: React.ReactNode }) {
  const [done, setDone] = React.useState<string[]>([]);
  const [channel, setChannel] = React.useState<ContactChannel>("phone");
  const [messageIds, setMessageIds] = React.useState<CaringMessageId[]>([]);
  const part2 = careTransitionIncludesPart2({ done });
  const total = TRANSITION_SECTIONS.reduce((n, s) => n + s.items.length, 0);

  return (
    <div className="space-y-6">
      <Notice tone="crisis" title="Safety first">
        <p>
          The weeks after discharge carry extra risk. If the client may act on thoughts of suicide now, follow your crisis
          protocol. This checklist records steps; it never judges risk.
        </p>
        <CrisisInline />
      </Notice>

      <div className="flex flex-wrap items-center gap-2">
        <ClinicianReviewBadge />
        <span className="text-sm text-muted" aria-live="polite">
          {done.length} of {total} steps ticked
        </span>
      </div>

      {TRANSITION_SECTIONS.map((s) => (
        <Card key={s.id} className="space-y-3">
          <fieldset className="space-y-2">
            <legend className="mb-1 text-lg font-semibold">{s.heading}</legend>
            {s.items.map((i) => (
              <CheckRow key={i.id} checked={done.includes(i.id)} onChange={(on) => setDone((l) => toggle(l, i.id, on))}>
                {i.label}
              </CheckRow>
            ))}
          </fieldset>
          {s.fills?.length ? (
            <p className="text-sm text-muted">The printout has a blank line for: {s.fills.join("; ").toLowerCase()}.</p>
          ) : null}
        </Card>
      ))}

      {part2 ? (
        <div className="space-y-3">
          <Notice tone="warn" title="42 CFR Part 2">
            <p>Part 2 records are being shared. The printout carries the notice: {DOC_PART2_NOTICE}</p>
          </Notice>
          {sudPrompt}
        </div>
      ) : null}

      <Card className="space-y-4">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <MessageSquareHeart aria-hidden className="size-5 text-accent" />
          Caring contacts
        </h2>
        <p className="text-sm text-muted">
          Short, warm messages over the coming months, sent from your service&apos;s approved system. They ask nothing of the
          client and carry no clinical details. This app never sends messages.
        </p>
        <ChoiceGroup legend="Agreed channel" name="ct-channel" value={channel} options={CONTACT_CHANNELS} onChange={setChannel} />
        <fieldset className="space-y-2">
          <legend className="mb-1 text-sm font-semibold">Example messages to print (optional)</legend>
          {CARING_MESSAGES.map((m) => (
            <CheckRow key={m.id} checked={messageIds.includes(m.id)} onChange={(on) => setMessageIds((l) => toggle(l, m.id, on))}>
              {m.text}
            </CheckRow>
          ))}
        </fieldset>
        <p>
          <Link
            href="/practice/caring-contacts"
            className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-accent underline underline-offset-2"
          >
            Caring contacts: when, how often and what to avoid
            <ArrowRight aria-hidden className="size-4" />
          </Link>
        </p>
      </Card>

      <Card className="space-y-4">
        <h2 className="text-lg font-semibold">Print the checklist</h2>
        <p className="text-sm text-muted">
          For your own record or the receiving team. Dates, names and contacts are blank lines to fill in by hand; the crisis
          lines and the disclaimer are on every copy.
        </p>
        <ExportActions flushAll={() => {}} build={() => careTransitionDoc({ done, channel, messageIds })} />
        <p>
          <Link
            href="/practice/care-transitions-and-warm-handoffs"
            className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-accent underline underline-offset-2"
          >
            Care transitions and warm handoffs guide
            <ArrowRight aria-hidden className="size-4" />
          </Link>
        </p>
        <Governance {...CARE_TRANSITION_GOVERNANCE} />
      </Card>
    </div>
  );
}
