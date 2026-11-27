"use client";
import * as React from "react";
import { BookOpen, Layers, Plus, Trash2 } from "lucide-react";
import { CrisisInline } from "@/components/crisis/crisis-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Disclosure } from "@/components/ui/disclosure";
import { ExternalLink } from "@/components/ui/external-link";
import { Notice } from "@/components/ui/notice";
import type { PlanModule } from "@/lib/schemas-phase2";
import { usePlan } from "./plan-context";
import { addModule, moduleApplies, moduleHasSelections, removeModule } from "./plan-model";

function ModuleBadges({ module }: { module: PlanModule }) {
  const { option } = usePlan();
  return (
    <span className="flex flex-wrap gap-1.5">
      {module.appliesTo !== "any" ? <Badge tone="accent">Fits {option.label}</Badge> : null}
      {module.sud ? <Badge tone="warn">42 CFR Part 2</Badge> : null}
      {module.crisisPanel ? <Badge tone="crisis">Crisis resources shown</Badge> : null}
      {module.reviewedBy === "PENDING" ? <Badge tone="warn">Not yet clinically reviewed</Badge> : null}
    </span>
  );
}

/**
 * "Add a module" for the Problems step: cross-cutting modules that fit this plan library, condition-specific ones
 * first. Adding a module adds its problems unchecked (G3); nothing enters the plan until the clinician checks it.
 */
export function ModulePicker() {
  const { draft, update, modules, measures } = usePlan();
  const [announce, setAnnounce] = React.useState("");
  const available = modules
    .filter((m) => moduleApplies(m, draft.conditionId) && !draft.moduleIds.includes(m.id))
    .sort((a, b) => Number(a.appliesTo === "any") - Number(b.appliesTo === "any") || a.title.localeCompare(b.title));
  return (
    <div className="space-y-2">
      <Disclosure
        title="Add a cross-cutting module"
        meta={`${available.length} available`}
        icon={Layers}
        bordered={false}
        className="rounded-xl border border-border bg-surface-2 px-4"
        bodyClassName="pb-4"
      >
        <p className="mb-3 text-sm leading-relaxed text-muted">
          Modules add problems that cut across conditions, such as safety-focused objectives, sleep, engagement,
          social needs or work stress. Their items stay unchecked until you check them.
        </p>
        {available.length ? (
          <ul className="space-y-2">
            {available.map((m) => (
              <li key={m.id} className="space-y-2 rounded-xl border border-border bg-surface p-3">
                <p className="text-sm font-semibold leading-snug">{m.title}</p>
                <p className="text-sm leading-relaxed text-muted">{m.summary}</p>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <ModuleBadges module={m} />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="min-h-11"
                    onClick={() => {
                      update((d) => addModule(d, m, measures));
                      setAnnounce(`Added ${m.title}: ${m.problems.length} ${m.problems.length === 1 ? "problem" : "problems"}, shown above, unchecked.`);
                    }}
                  >
                    <Plus aria-hidden />
                    Add <span className="sr-only">{m.title}</span>
                    <span aria-hidden>({m.problems.length})</span>
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">Every module that fits this library is already added.</p>
        )}
      </Disclosure>
      <p role="status" aria-live="polite" className="text-sm text-muted">
        {announce}
      </p>
    </div>
  );
}

/** A module's problems in the Problems step, with its guidance, sources, crisis resources and a remove button. */
export function ModuleGroup({ module, children, onRemoved }: { module: PlanModule; children: React.ReactNode; onRemoved: () => void }) {
  const { draft, update } = usePlan();
  const locked = moduleHasSelections(draft, module.id);
  const hintId = React.useId();
  const headingId = `plan-module-${module.id}`;
  return (
    <section aria-labelledby={headingId} className="space-y-3 rounded-xl border border-accent/30 p-3 sm:p-4">
      <div className="space-y-1.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-accent">Module</p>
        <h3 id={headingId} className="text-base font-semibold leading-snug">
          {module.title}
        </h3>
        <ModuleBadges module={module} />
      </div>
      {module.crisisPanel ? (
        <Notice tone="crisis" title="Crisis resources, always available">
          <CrisisInline />
          <p className="text-xs">The clinician assesses risk directly and makes every decision; nothing here rates or decides risk.</p>
        </Notice>
      ) : null}
      <Disclosure title="How to use this module" icon={BookOpen} bordered={false} bodyClassName="pb-1">
        <p className="text-sm leading-relaxed">{module.collaborativeNote}</p>
        <p className="mt-2 text-xs font-semibold">Sources</p>
        <ul className="space-y-1">
          {module.sources.map((s) => (
            <li key={s.url} className="text-xs">
              <ExternalLink href={s.url}>{s.title}</ExternalLink>
              <span className="text-muted">
                {" "}
                · {s.publisher}
                {s.year ? `, ${s.year}` : ""}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted">
          License: original wording (app-authored) · Last verified {module.lastVerified} · Clinical review:{" "}
          {module.reviewedBy === "PENDING" ? "pending" : module.reviewedBy}
        </p>
      </Disclosure>
      {children}
      <div className="space-y-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="min-h-11"
          disabled={locked}
          aria-describedby={locked ? hintId : undefined}
          onClick={() => {
            update((d) => removeModule(d, module.id));
            onRemoved();
          }}
        >
          <Trash2 aria-hidden />
          Remove this module
        </Button>
        {locked ? (
          <p id={hintId} className="text-xs text-muted">
            To remove it, first uncheck its items and restore any edited wording.
          </p>
        ) : null}
      </div>
    </section>
  );
}
