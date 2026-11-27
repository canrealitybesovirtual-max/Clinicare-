/**
 * Server-rendered pieces of the formulation pages: cards for the index, the parts of a framework, the curated factor
 * map, behavior functions, reference codes and related links. Content arrives as props; nothing here is interactive.
 */
import type * as React from "react";
import Link from "next/link";
import { ArrowRight, BookOpen, ClipboardPen, GraduationCap, Scale } from "lucide-react";
import type { BehaviorFunction, Formulation, FormulationFactor, FormulationPart } from "@/lib/schemas-formulations";
import { ReviewBadge } from "@/components/content/content-meta";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Disclosure } from "@/components/ui/disclosure";
import { ExternalLink } from "@/components/ui/external-link";

export interface NamedLink {
  href: string;
  label: string;
}

const linkClass = "inline-flex min-h-11 items-center gap-1.5 font-semibold text-accent underline underline-offset-2";

/** The first sentence of a summary, for cards. */
export function firstSentence(text: string): string {
  const m = /^.+?[.!?](?=\s|$)/.exec(text);
  return m ? m[0] : text;
}

/** Badges shared by the index cards and the detail header. */
export function FormulationBadges({ f, inList = false }: { f: Formulation; inList?: boolean }) {
  return (
    <>
      {f.worksheet ? (
        <Badge tone="accent">
          <ClipboardPen aria-hidden className="size-3.5" /> Worksheet
        </Badge>
      ) : null}
      {f.trainingRequired ? (
        <Badge tone="warn">
          <GraduationCap aria-hidden className="size-3.5" /> Trained clinicians only
        </Badge>
      ) : null}
      {f.sud ? (
        <Badge tone="warn">
          <Scale aria-hidden className="size-3.5" /> 42 CFR Part 2
        </Badge>
      ) : null}
      <ReviewBadge reviewedBy={f.reviewedBy} inList={inList} />
    </>
  );
}

export function FormulationCard({ f }: { f: Formulation }) {
  return (
    <Link
      href={`/formulations/${f.id}`}
      className="group flex h-full flex-col gap-2 rounded-2xl border border-border bg-surface p-4 shadow-sm transition-colors hover:border-accent sm:p-5"
    >
      <span className="flex items-start gap-1.5 text-base font-semibold leading-snug">
        <span className="min-w-0 flex-1">{f.name}</span>
        <ArrowRight aria-hidden className="mt-0.5 size-4 shrink-0 text-accent transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" />
      </span>
      <span className="text-sm leading-relaxed text-muted">{firstSentence(f.purpose)}</span>
      <span className="mt-auto flex flex-wrap gap-1.5 pt-1">
        <FormulationBadges f={f} inList />
      </span>
    </Link>
  );
}

/** Links to library items that exist; names come from the caller. */
export function LinkList({ items, ordered = false }: { items: NamedLink[]; ordered?: boolean }) {
  const List = ordered ? "ol" : "ul";
  return (
    <List className={ordered ? "list-decimal space-y-0.5 pl-5 text-sm marker:font-semibold" : "space-y-0.5 text-sm"}>
      {items.map((l) => (
        <li key={l.href} className={ordered ? "pl-1" : undefined}>
          <Link href={l.href} className={linkClass}>
            {l.label}
          </Link>
        </li>
      ))}
    </List>
  );
}

export function PartsList({
  parts,
  interventionLink,
  conditionName,
}: {
  parts: FormulationPart[];
  interventionLink: (id: string) => NamedLink | null;
  conditionName: (id: string) => string | null;
}) {
  return (
    <ol className="space-y-5">
      {parts.map((p, i) => {
        const ivs = (p.interventionIds ?? []).flatMap((id) => interventionLink(id) ?? []);
        const conditions = (p.conditionIds ?? []).flatMap((id) => conditionName(id) ?? []);
        return (
          <li key={p.id} className="space-y-2 border-t border-border pt-4 first:border-t-0 first:pt-0">
            <h3 className="text-base font-semibold">
              <span className="text-muted">{i + 1}. </span>
              {p.label}
            </h3>
            <p className="text-sm leading-relaxed">{p.prompt}</p>
            {p.examples.length ? (
              <div>
                <p className="text-sm font-semibold">{conditions.length ? "How the cycle runs" : "Examples"}</p>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-sm leading-relaxed text-muted">
                  {p.examples.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {conditions.length ? (
              <p className="text-sm">
                <span className="font-semibold">Often relevant to:</span> {conditions.join("; ")}
              </p>
            ) : null}
            {ivs.length ? (
              <div>
                <p className="text-sm font-semibold">Interventions it explains, in the usual order</p>
                <LinkList items={ivs} ordered />
              </div>
            ) : null}
            {p.reference ? (
              <p className="flex items-start gap-2 text-xs text-muted">
                <BookOpen aria-hidden className="mt-0.5 size-3.5 shrink-0" />
                <span>
                  Key reference: <ExternalLink href={p.reference.url}>{p.reference.title}</ExternalLink>
                </span>
              </p>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

const KIND_HEADINGS: Record<FormulationFactor["kind"], string> = {
  maintaining: "Maintaining processes",
  context: "Life context",
  strength: "Strengths and resources",
};

export function FactorMap({ factors, interventionLink }: { factors: FormulationFactor[]; interventionLink: (id: string) => NamedLink | null }) {
  const kinds: FormulationFactor["kind"][] = ["maintaining", "context", "strength"];
  return (
    <div className="space-y-5">
      {kinds.map((kind) => {
        const list = factors.filter((f) => f.kind === kind);
        if (!list.length) return null;
        return (
          <div key={kind}>
            <h3 className="text-base font-semibold">{KIND_HEADINGS[kind]}</h3>
            <div className="mt-1">
              {list.map((f) => {
                const ivs = f.interventionIds.flatMap((id) => interventionLink(id) ?? []);
                return (
                  <Disclosure key={f.id} id={`factor-${f.id}`} title={f.label} meta={ivs.length ? `${ivs.length} linked` : undefined}>
                    <p>{f.description}</p>
                    <p className="text-muted">
                      <span className="font-semibold text-text">In plain words:</span> {f.plainLabel}
                    </p>
                    {ivs.length ? <LinkList items={ivs} /> : null}
                  </Disclosure>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function FunctionList({ functions, interventionLink }: { functions: BehaviorFunction[]; interventionLink: (id: string) => NamedLink | null }) {
  return (
    <div>
      {functions.map((f) => {
        const ivs = f.interventionIds.flatMap((id) => interventionLink(id) ?? []);
        return (
          <Disclosure key={f.id} title={f.label} meta={ivs.length ? `${ivs.length} linked` : undefined}>
            <p>{f.description}</p>
            <p className="text-muted">
              <span className="font-semibold text-text">In plain words:</span> {f.plainLabel}
            </p>
            {ivs.length ? <LinkList items={ivs} /> : null}
          </Disclosure>
        );
      })}
    </div>
  );
}

export function CodesTable({ codes, dsmPointer }: { codes: NonNullable<Formulation["codes"]>; dsmPointer: string }) {
  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[18rem] text-left text-sm">
          <caption className="sr-only">Reference codes</caption>
          <thead>
            <tr className="border-b border-border text-xs uppercase tracking-wide text-muted">
              <th scope="col" className="py-2 pr-3 font-semibold">
                System
              </th>
              <th scope="col" className="py-2 pr-3 font-semibold">
                Code
              </th>
              <th scope="col" className="py-2 font-semibold">
                Title
              </th>
            </tr>
          </thead>
          <tbody>
            {codes.map((c) => (
              <tr key={c.system + c.code} className="border-b border-border last:border-b-0">
                <td className="py-2 pr-3 whitespace-nowrap">{c.system}</td>
                <td className="py-2 pr-3 font-mono whitespace-nowrap">{c.code}</td>
                <td className="py-2">{c.label}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-sm">{dsmPointer}</p>
    </div>
  );
}

/** A titled group of related links, left out when empty. */
export function RelatedGroup({ title, items, note }: { title: string; items: NamedLink[]; note?: React.ReactNode }) {
  if (!items.length) return null;
  return (
    <div>
      <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">{title}</h3>
      <LinkList items={items} />
      {note ? <p className="text-xs text-muted">{note}</p> : null}
    </div>
  );
}

export function SectionCard({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="scroll-mt-6">
      <Card className="space-y-4">
        <h2 id={id} className="text-lg font-semibold">
          {title}
        </h2>
        {children}
      </Card>
    </section>
  );
}
