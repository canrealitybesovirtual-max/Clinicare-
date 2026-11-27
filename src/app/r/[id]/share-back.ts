import type { Text } from "@/lib/i18n/core";

/** Back link on the public share pages: the self-help home, never a clinician screen. */
export const SHARE_BACK: { href: string; label: Text } = {
  href: "/client",
  label: { en: "More self-help and where to get help", es: "Más autoayuda y dónde buscar ayuda" },
};
