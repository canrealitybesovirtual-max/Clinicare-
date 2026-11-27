"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useT } from "@/lib/i18n/core";
import { ERRORS } from "@/lib/i18n/shell";
import { CLIENT_HOME, isClientPath } from "@/components/layout/paths";
import { Button, buttonVariants } from "@/components/ui/button";

/**
 * Route error boundary. Deliberately shows no error details and logs nothing:
 * an error message could contain clinical text from the session (G5). Client pages link back to the client home.
 */
export default function RouteError({ retry }: { error: unknown; retry: () => void }) {
  const t = useT();
  const client = isClientPath(usePathname());
  return (
    <div className="mx-auto max-w-xl py-10 text-center">
      <h1 className="text-2xl font-bold sm:text-3xl">{t(ERRORS.title)}</h1>
      <p className="mt-3 text-muted">{t(ERRORS.body)}</p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Button type="button" onClick={() => retry()}>
          {t(ERRORS.retry)}
        </Button>
        <Link href={client ? CLIENT_HOME : "/"} className={buttonVariants({ variant: "outline" })}>
          {t(ERRORS.home)}
        </Link>
      </div>
    </div>
  );
}
