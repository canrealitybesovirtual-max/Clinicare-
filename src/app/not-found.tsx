import Link from "next/link";
import type { Metadata } from "next";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl py-10 text-center">
      <p className="text-sm font-semibold uppercase tracking-wide text-accent">404</p>
      <h1 className="mt-2 text-2xl font-bold sm:text-3xl">This page does not exist</h1>
      <p className="mt-3 text-muted">
        The link may be out of date. Nothing you typed was sent anywhere. Crisis help stays available from the button on
        every screen.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Link href="/" className={buttonVariants({ variant: "primary" })}>
          Go to home
        </Link>
        <Link href="/symptoms" className={buttonVariants({ variant: "outline" })}>
          Symptom Finder
        </Link>
        <Link href="/client" className={buttonVariants({ variant: "outline" })}>
          Client self-help
        </Link>
      </div>
    </div>
  );
}
