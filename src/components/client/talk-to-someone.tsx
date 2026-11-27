"use client";
import { HeartHandshake } from "lucide-react";
import { useT, type Text } from "@/lib/i18n/core";

const DEFAULT_TITLE: Text = { en: "Talk with a licensed professional", es: "Hable con un profesional con licencia" };

const DEFAULT_BODY: Text = {
  en: "The tips here are things you can try on your own. They do not take the place of a counselor, therapist, doctor or nurse. If you are having a hard time, or things are not getting better, please talk with a licensed professional. Asking for help is a strong step.",
  es: "Los consejos de aquí son cosas que puede probar por su cuenta. No reemplazan a un consejero, terapeuta, médico o enfermero. Si está pasando por un momento difícil, o las cosas no mejoran, por favor hable con un profesional con licencia. Pedir ayuda es un paso valiente.",
};

/** "Talk with a licensed professional" prompt for client-facing pages (spec section 9). Plain language, EN/ES. */
export function TalkToSomeone({ id, title = DEFAULT_TITLE, body = DEFAULT_BODY }: { id: string; title?: Text; body?: Text }) {
  const t = useT();
  return (
    <section aria-labelledby={id}>
      <div className="flex gap-4 rounded-2xl border border-accent/30 bg-accent-soft p-5 sm:p-6">
        <HeartHandshake aria-hidden className="mt-0.5 size-7 shrink-0 text-accent" />
        <div className="space-y-1.5">
          <h2 id={id} className="text-lg font-semibold">
            {t(title)}
          </h2>
          <p className="leading-relaxed">{t(body)}</p>
        </div>
      </div>
    </section>
  );
}
