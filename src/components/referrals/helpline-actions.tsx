/**
 * Call / text / chat buttons for one curated helpline (link out only, G8). Shared by the clinician Referrals
 * directory and the client "Where to get help" page so both get 44px tel: and sms: buttons.
 * Numbers come only from curated directory entries, never from typed text.
 */
import { MessageCircle, MessageSquareText, Phone } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { ExternalLink } from "@/components/ui/external-link";
import { cn } from "@/lib/utils";
import { smsHref, telHref } from "./referral-format";

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
  const tel = telHref(phone);
  const sms = smsHref(text);
  if (!tel && !sms && !chat) return null;
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {tel && phone ? (
        <a href={tel} className={buttonVariants({ variant: crisis ? "crisis" : "primary" })}>
          <Phone aria-hidden />
          Call {phone}
          <span className="sr-only"> ({name})</span>
        </a>
      ) : null}
      {sms && text ? (
        <a href={sms} className={buttonVariants({ variant: "outline" })}>
          <MessageSquareText aria-hidden />
          {text}
          <span className="sr-only"> ({name})</span>
        </a>
      ) : null}
      {chat ? (
        <ExternalLink href={chat} showIcon={false} className={cn(buttonVariants({ variant: "outline" }), "font-semibold no-underline")}>
          <MessageCircle aria-hidden />
          Chat online
          <span className="sr-only"> with {name}</span>
        </ExternalLink>
      ) : null}
    </div>
  );
}
