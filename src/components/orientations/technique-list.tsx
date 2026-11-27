import Link from "next/link";
import { GraduationCap, HeartHandshake } from "lucide-react";
import { Disclosure } from "@/components/ui/disclosure";
import type { Intervention } from "@/lib/schemas-phase2";

/** How many techniques show before the rest fold into a disclosure, so long lists stay calm on phones. */
const TECHNIQUES_SHOWN = 10;

function TechniqueItem({ iv }: { iv: Pick<Intervention, "id" | "name" | "modality" | "trainingRequired"> }) {
  return (
    <li className="min-w-0">
      <Link
        href={`/interventions/${iv.id}`}
        className="group flex min-h-11 items-start gap-2 rounded-lg py-1.5 font-semibold text-accent"
      >
        <HeartHandshake aria-hidden className="mt-0.5 size-4 shrink-0" />
        <span className="min-w-0">
          <span className="underline decoration-accent/40 underline-offset-2 group-hover:decoration-accent">{iv.name}</span>
          <span className="block text-xs font-normal text-muted">
            {iv.modality}
            {iv.trainingRequired ? (
              <span className="ml-1 inline-flex items-center gap-0.5 text-warn-fg">
                · <GraduationCap aria-hidden className="size-3" /> trained clinicians only
              </span>
            ) : null}
          </span>
        </span>
      </Link>
    </li>
  );
}

/** Library interventions linked to /interventions/[id]; after TECHNIQUES_SHOWN items the rest open on request. */
export function TechniqueList({ items, label }: { items: Pick<Intervention, "id" | "name" | "modality" | "trainingRequired">[]; label: string }) {
  const first = items.slice(0, TECHNIQUES_SHOWN);
  const rest = items.slice(TECHNIQUES_SHOWN);
  const list = "grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2";
  return (
    <div>
      <ul className={list} aria-label={label}>
        {first.map((iv) => (
          <TechniqueItem key={iv.id} iv={iv} />
        ))}
      </ul>
      {rest.length ? (
        <Disclosure title={`Show ${rest.length} more`} className="mt-2" bodyClassName="pt-1">
          <ul className={list} aria-label={`${label}, continued`}>
            {rest.map((iv) => (
              <TechniqueItem key={iv.id} iv={iv} />
            ))}
          </ul>
        </Disclosure>
      ) : null}
    </div>
  );
}
