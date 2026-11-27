import type * as React from "react";
import { HeartHandshake } from "lucide-react";

/** "Talk with a licensed professional" prompt for client-facing pages (spec section 9). Plain language. */
export function TalkToSomeone({ id, title, children }: { id: string; title: string; children?: React.ReactNode }) {
  return (
    <section aria-labelledby={id}>
      <div className="flex gap-4 rounded-2xl border border-accent/30 bg-accent-soft p-5">
        <HeartHandshake aria-hidden className="mt-0.5 size-7 shrink-0 text-accent" />
        <div className="space-y-1.5">
          <h2 id={id} className="text-lg font-semibold">
            {title}
          </h2>
          {children ?? (
            <p className="leading-relaxed">
              The tips here are things you can try on your own. They do not take the place of a counselor, therapist,
              doctor or nurse. If you are having a hard time, or things are not getting better, please talk with a
              licensed professional. Asking for help is a strong step.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
