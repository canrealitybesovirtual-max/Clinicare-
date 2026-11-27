"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { fill, useT } from "@/lib/i18n/core";
import { CLIENT_DISCLAIMER, DISCLAIMER, FOOTER } from "@/lib/i18n/shell";
import { ExternalLink } from "@/components/ui/external-link";
import { isClientPath } from "./paths";

const strongLink = "font-semibold text-text underline underline-offset-2";

/**
 * Disclaimer footer on every screen (G14), with crisis numbers (G9). Client pages (/client/**, /r/**) get the
 * client wording: the positioning sentence plus a plain-language "general information, not medical advice" line,
 * and a link to the client help page instead of the clinician About page.
 */
export function SiteFooter() {
  const client = isClientPath(usePathname());
  const t = useT();
  return (
    <footer id="site-footer" className="mt-16 border-t border-border bg-surface pb-24 lg:pb-0">
      <div className="mx-auto grid max-w-6xl gap-4 px-4 py-8 text-sm sm:grid-cols-[1fr_auto] sm:items-start sm:px-6">
        <div className="max-w-reading space-y-2.5">
          <p className="flex items-start gap-2 font-semibold text-text">
            <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-accent" />
            {t(client ? CLIENT_DISCLAIMER : DISCLAIMER)}
          </p>
          <p className="text-muted">{t(client ? FOOTER.clientNote : FOOTER.clinicianNote)}</p>
          <p className="text-muted">
            {fill(t(client ? FOOTER.crisisClient : FOOTER.crisisClinician), {
              line: (
                <a className={strongLink} href="tel:988">
                  988
                </a>
              ),
              directory: (
                <ExternalLink href="https://findahelpline.com" showIcon={false} className={strongLink}>
                  findahelpline.com
                </ExternalLink>
              ),
            })}
          </p>
        </div>
        <Link
          href={client ? "/client/help" : "/about"}
          hrefLang={client ? undefined : "en"}
          className="inline-flex min-h-11 items-center font-semibold text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent"
        >
          {t(client ? FOOTER.findHelp : FOOTER.about)}
        </Link>
      </div>
    </footer>
  );
}
