"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useT } from "@/lib/i18n/core";
import { ERRORS, NAV } from "@/lib/i18n/shell";
import { buttonVariants } from "@/components/ui/button";
import { CLIENT_HOME, isClientPath } from "./paths";

/** 404 body. A client who follows an old share or topic link sees only client pages, never clinician screens (G3). */
export function NotFoundContent() {
  const t = useT();
  const client = isClientPath(usePathname());
  const links = client
    ? [
        { href: CLIENT_HOME, label: t(ERRORS.selfHelpHome), primary: true },
        { href: "/client/help", label: t(NAV.findHelp) },
      ]
    : [
        { href: "/", label: t(ERRORS.home), primary: true },
        { href: "/symptoms", label: t(ERRORS.symptomFinder) },
        { href: CLIENT_HOME, label: t(ERRORS.clientSelfHelp) },
      ];
  return (
    <div className="mx-auto max-w-xl py-10 text-center">
      <p className="text-sm font-semibold uppercase tracking-wide text-accent">404</p>
      <h1 className="mt-2 text-2xl font-bold sm:text-3xl">{t(ERRORS.notFoundTitle)}</h1>
      <p className="mt-3 text-muted">{t(client ? ERRORS.notFoundClient : ERRORS.notFoundClinician)}</p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        {links.map((l) => (
          <Link key={l.href} href={l.href} className={buttonVariants({ variant: l.primary ? "primary" : "outline" })}>
            {l.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
