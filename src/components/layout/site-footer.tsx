import Link from "next/link";
import { ShieldCheck } from "lucide-react";

export const DISCLAIMER =
  "Resource only. Not a substitute for clinical judgment. Not a medical device. For licensed clinicians.";

/** Disclaimer footer on every screen (G14). */
export function SiteFooter() {
  return (
    <footer id="site-footer" className="mt-12 border-t border-border bg-surface pb-24 lg:pb-0">
      <div className="mx-auto grid max-w-6xl gap-4 px-4 py-6 text-sm sm:grid-cols-[1fr_auto] sm:items-start">
        <div className="space-y-2">
          <p className="flex items-start gap-2 font-semibold text-text">
            <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-accent" />
            {DISCLAIMER}
          </p>
          <p className="text-muted">
            Phase 1 reference build. Content is original wording with named sources and is awaiting licensed clinical
            review. Nothing you type is stored. Lookups send only a code, a curated term, a drug name, or a ZIP code or
            city, never what you typed about the client.
          </p>
          <p className="text-muted">
            In crisis? In the US call or text <a className="font-semibold text-text underline underline-offset-2" href="tel:988">988</a>.
            Elsewhere, call your local emergency number or visit{" "}
            <a
              className="font-semibold text-text underline underline-offset-2"
              href="https://findahelpline.com"
              target="_blank"
              rel="noopener noreferrer"
            >
              findahelpline.com<span className="sr-only"> (opens in a new tab)</span>
            </a>
            .
          </p>
        </div>
        <Link
          href="/about"
          className="inline-flex min-h-11 items-center font-semibold text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent"
        >
          About, privacy and licensing
        </Link>
      </div>
    </footer>
  );
}
