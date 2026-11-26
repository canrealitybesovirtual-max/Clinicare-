"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardList, FileText, Info, ListChecks, TextSearch } from "lucide-react";
import { CrisisButton } from "@/components/crisis/crisis-button";
import { PrivacyBar } from "./privacy-bar";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/symptoms", label: "Symptoms", icon: TextSearch },
  { href: "/diagnoses", label: "Diagnoses", icon: ListChecks },
  { href: "/measures", label: "Measures", icon: ClipboardList },
  { href: "/handouts", label: "Handouts", icon: FileText },
  { href: "/about", label: "About", icon: Info },
] as const;

export function isClientPath(pathname: string | null): boolean {
  return pathname === "/client" || (pathname?.startsWith("/client/") ?? false);
}

function isActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function Brand() {
  return (
    <Link href="/" className="flex min-h-11 items-center gap-2.5 rounded-lg pr-1">
      {/* Local file, decorative: the link text names the app. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icons/icon.svg" alt="" width={36} height={36} className="size-9 shrink-0" />
      <span className="max-w-[9.5rem] text-sm font-bold leading-tight text-primary sm:max-w-none sm:text-base dark:text-text">
        Clinician Resource Companion
      </span>
    </Link>
  );
}

function ModeSwitch({ client }: { client: boolean }) {
  const item =
    "inline-flex min-h-10 items-center rounded-md px-3 text-xs font-semibold transition-colors sm:text-sm aria-[current=page]:bg-surface aria-[current=page]:text-text aria-[current=page]:shadow-sm";
  return (
    <nav aria-label="Mode" className="shrink-0">
      <div className="flex rounded-lg border border-border bg-surface-2 p-0.5 text-muted">
        <Link href="/symptoms" className={item} aria-current={client ? undefined : "page"}>
          Clinician
        </Link>
        <Link href="/client" className={item} aria-current={client ? "page" : undefined}>
          Client
        </Link>
      </div>
    </nav>
  );
}

function MainNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="min-w-0">
      <ul className="grid grid-cols-5 gap-1 lg:flex lg:gap-1">
        {NAV.map((n) => {
          const active = isActive(pathname, n.href);
          return (
            <li key={n.href} className="min-w-0">
              <Link
                href={n.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-lg px-1 text-xs font-medium text-muted hover:bg-surface-2 hover:text-text",
                  "lg:min-h-11 lg:flex-row lg:gap-1.5 lg:px-3 lg:text-sm",
                  active && "bg-accent-soft font-semibold text-accent hover:bg-accent-soft hover:text-accent",
                )}
              >
                <n.icon aria-hidden className="size-4 shrink-0 lg:hidden" />
                <span className="truncate">{n.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Banner landmark: brand, navigation, mode switch, crisis button, privacy banner. */
export function SiteHeader() {
  const pathname = usePathname();
  const client = isClientPath(pathname);
  return (
    <header className="border-b border-border bg-surface">
      <a
        href="#main"
        className="sr-only z-[60] rounded-lg bg-primary px-4 py-3 font-semibold text-primary-fg focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
      >
        Skip to main content
      </a>
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 lg:flex-nowrap lg:gap-x-5">
        <Brand />
        <div className="order-last w-full lg:order-none lg:w-auto lg:flex-1">
          {client ? (
            <p className="pb-1 text-sm font-medium text-muted lg:pb-0">Self-help · plain language</p>
          ) : (
            <MainNav />
          )}
        </div>
        <div className="ml-auto flex items-center gap-2 lg:ml-0">
          <ModeSwitch client={client} />
          <CrisisButton plain={client} />
        </div>
      </div>
      <PrivacyBar client={client} />
    </header>
  );
}
