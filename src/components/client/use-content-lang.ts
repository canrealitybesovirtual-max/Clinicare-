"use client";
/**
 * Language for a client page's content. Follows the shell language (header switch, memory only), except that a
 * page can open in a given language: the Spanish share link /r/<id>/es renders Spanish from the first paint and
 * then switches the whole shell to Spanish, so the header, footer and crisis help follow.
 */
import * as React from "react";
import { useLang, type Lang } from "@/lib/i18n/core";

export function useContentLang(initial?: Lang): { lang: Lang; setLang: (lang: Lang) => void } {
  const { lang, setLang } = useLang();
  const [pinned, setPinned] = React.useState<Lang | undefined>(initial);
  React.useEffect(() => {
    if (!pinned) return;
    setLang(pinned);
    setPinned(undefined);
  }, [pinned, setLang]);
  return { lang: pinned ?? lang, setLang };
}
