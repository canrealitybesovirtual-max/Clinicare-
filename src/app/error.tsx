"use client";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";

/**
 * Route error boundary. Deliberately shows no error details and logs nothing:
 * an error message could contain clinical text from the session (G5).
 */
export default function RouteError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <div className="mx-auto max-w-xl py-10 text-center">
      <h1 className="text-2xl font-bold sm:text-3xl">Something went wrong</h1>
      <p className="mt-3 text-muted">
        This screen could not be shown. No details were recorded or sent. You can try again, or use the crisis button at
        any time.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Button type="button" onClick={() => retry()}>
          Try again
        </Button>
        <Link href="/" className={buttonVariants({ variant: "outline" })}>
          Go to home
        </Link>
      </div>
    </div>
  );
}
