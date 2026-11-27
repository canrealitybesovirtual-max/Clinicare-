"use client";
import * as React from "react";
import { Pencil, RotateCcw, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { isCustom, isEdited, type PlanTextItem } from "./plan-model";
import { PlanTextField } from "./plan-text-field";

/**
 * One selectable, editable line of the plan (definition, goal, objective or problem statement).
 * The checkbox adds it to the plan (G3: a clinician click); "Edit wording" opens a scrubbed editor.
 */
export function PlanItem({
  item,
  kind,
  onToggle,
  onText,
  onRemove,
  children,
}: {
  item: PlanTextItem;
  /** Lower-case noun for labels, e.g. "definition". */
  kind: string;
  onToggle: (selected: boolean) => void;
  onText: (clean: string) => void;
  onRemove?: () => void;
  children?: React.ReactNode;
}) {
  const custom = isCustom(item);
  const edited = isEdited(item);
  // A newly added custom item opens straight into its editor.
  const [editing, setEditing] = React.useState(custom && item.text === "");
  const [focusOnOpen, setFocusOnOpen] = React.useState(custom && item.text === "");
  const base = React.useId();
  const checkboxId = `${base}-cb`;
  const editorId = `${base}-editor`;
  const editButton = React.useRef<HTMLButtonElement>(null);

  return (
    <li className="rounded-xl border border-border bg-surface p-3 has-[input[type=checkbox]:checked]:border-accent/60 has-[input[type=checkbox]:checked]:bg-accent-soft/40 sm:p-4">
      <div className="flex items-start gap-3">
        <input
          id={checkboxId}
          type="checkbox"
          checked={item.selected}
          onChange={(e) => onToggle(e.target.checked)}
          className="mt-0.5 size-5 shrink-0 accent-[var(--accent)]"
        />
        <label htmlFor={checkboxId} className="min-w-0 flex-1 cursor-pointer text-sm leading-relaxed">
          {item.text ? item.text : <span className="italic text-muted">Empty {kind}: add the wording below</span>}
        </label>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 pl-8">
        {custom ? <Badge tone="info">Added by you</Badge> : null}
        {edited ? <Badge tone="info">Edited</Badge> : null}
        {!editing ? (
          <Button
            ref={editButton}
            type="button"
            variant="ghost"
            size="sm"
            className="min-h-11"
            onClick={() => {
              setFocusOnOpen(true);
              setEditing(true);
            }}
          >
            <Pencil aria-hidden />
            Edit wording <span className="sr-only">of this {kind}</span>
          </Button>
        ) : null}
        {edited && item.libraryText !== undefined ? (
          <Button type="button" variant="ghost" size="sm" className="min-h-11" onClick={() => onText(item.libraryText!)}>
            <RotateCcw aria-hidden />
            Restore library wording
          </Button>
        ) : null}
        {custom && onRemove ? (
          <Button type="button" variant="ghost" size="sm" className="min-h-11" onClick={onRemove}>
            <Trash2 aria-hidden />
            Remove <span className="sr-only">this {kind}</span>
          </Button>
        ) : null}
      </div>
      {editing ? (
        <div id={editorId} className="mt-3 pl-8">
          <PlanTextField
            id={`${base}-text`}
            label={`Wording for this ${kind}`}
            value={item.text}
            onCommit={onText}
            autoFocus={focusOnOpen}
            onDone={() => {
              setEditing(false);
              requestAnimationFrame(() => editButton.current?.focus());
            }}
          />
        </div>
      ) : null}
      {children ? <div className="mt-3 pl-8">{children}</div> : null}
    </li>
  );
}
