"use client";
/**
 * Call / text / chat buttons for one curated helpline (link out only, G8). Shared by the clinician Referrals
 * directory and the client "Where to get help" page so both get 44px tel: and sms: buttons.
 * Numbers come only from curated directory entries, never from typed text. Button wording follows the shell
 * language: the text button is rebuilt from the curated instruction's keyword and number ("Text AYUDA to 988" ->
 * "Enviar AYUDA al 988"), so a Spanish page never shows an English instruction on a button. The curated service
 * name stays English and is marked so.
 */
import { MessageCircle, MessageSquareText, Phone } from "lucide-react";
import { fill, useLang, useT } from "@/lib/i18n/core";
import { buttonVariants } from "@/components/ui/button";
import { ExternalLink } from "@/components/ui/external-link";
import { cn } from "@/lib/utils";
import { smsHref, smsParts, telHref } from "./referral-format";

export function HelplineActions({
  name,
  phone,
  text,
  chat,
  crisis = false,
  className,
}: {
  name: string;
  /** Display form of the number, for example "1-800-273-8255". */
  phone: string | null | undefined;
  /** Curated text instruction, for example "Text HOME to 741741". */
  text: string | null | undefined;
  chat?: string | null;
  crisis?: boolean;
  className?: string;
}) {
  const t = useT();
  const { lang } = useLang();
  const tel = telHref(phone);
  const sms = smsHref(text);
  const parts = smsParts(text);
  if (!tel && !sms && !chat) return null;
  const curatedLang = lang === "en" ? undefined : "en";
  const forName = (
    <span className="sr-only" lang={curatedLang}>
      {" "}
      ({name})
    </span>
  );
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {tel && phone ? (
        <a href={tel} className={buttonVariants({ variant: crisis ? "crisis" : "primary" })}>
          <Phone aria-hidden />
          {fill(t({ en: "Call {n}", es: "Llamar al {n}" }), { n: phone })}
          {forName}
        </a>
      ) : null}
      {sms && parts ? (
        <a href={sms} className={buttonVariants({ variant: "outline" })}>
          <MessageSquareText aria-hidden />
          {parts.keyword
            ? fill(t({ en: "Text {k} to {n}", es: "Enviar {k} al {n}" }), { k: parts.keyword, n: parts.number })
            : fill(t({ en: "Text {n}", es: "Enviar un mensaje de texto al {n}" }), { n: parts.number })}
          {forName}
        </a>
      ) : null}
      {chat ? (
        <ExternalLink href={chat} showIcon={false} className={cn(buttonVariants({ variant: "outline" }), "font-semibold no-underline")}>
          <MessageCircle aria-hidden />
          {t({ en: "Chat online", es: "Chatear en línea" })}
          {forName}
        </ExternalLink>
      ) : null}
    </div>
  );
}
