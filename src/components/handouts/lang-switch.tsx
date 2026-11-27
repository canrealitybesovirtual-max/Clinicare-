"use client";
/**
 * "English / Español" switch for handout and client pages. The legend is in both languages, so a Spanish
 * speaker on an English page finds it, and each option is marked with its own language (WCAG 3.1.2).
 * The choice lives in React state only (G5).
 */
import type { Lang } from "@/lib/i18n/core";
import { ChoiceGroup, type Choice } from "@/components/ui/choice-group";

const OPTIONS: readonly Choice<Lang>[] = [
  { value: "en", label: "English", lang: "en" },
  { value: "es", label: "Español", lang: "es" },
];

export function LangSwitch({
  name,
  value,
  onChange,
  className,
}: {
  name: string;
  value: Lang;
  onChange: (lang: Lang) => void;
  className?: string;
}) {
  return (
    <ChoiceGroup
      legend={
        <>
          <span lang="en">Language</span> / <span lang="es">Idioma</span>
        </>
      }
      name={name}
      value={value}
      options={OPTIONS}
      onChange={onChange}
      className={className ?? "max-w-xs"}
    />
  );
}
