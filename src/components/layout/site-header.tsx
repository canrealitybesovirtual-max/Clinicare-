"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChevronDown,
  ClipboardList,
  FileText,
  HeartHandshake,
  Info,
  ListChecks,
  ListTodo,
  MapPin,
  Menu,
  Pill,
  Scale,
  TextSearch,
  Users,
  type LucideIcon,
} from "lucide-react";
import { CrisisButton } from "@/components/crisis/crisis-button";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { PrivacyBar } from "./privacy-bar";
import { cn } from "@/lib/utils";

/**
 * Where an item sits on wide screens: always in the bar ("lg"), in the bar from xl and in "More" below it ("xl"),
 * or always in "More" ("more"). Small screens show every item in the menu drawer.
 */
type Placement = "lg" | "xl" | "more";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  placement: Placement;
}

/** Clinician information architecture (spec section 3, screens 1-8). */
const CLINICIAN_NAV: readonly NavItem[] = [
  { href: "/symptoms", label: "Symptoms", icon: TextSearch, placement: "lg" },
  { href: "/diagnoses", label: "Diagnoses", icon: ListChecks, placement: "lg" },
  { href: "/measures", label: "Measures", icon: ClipboardList, placement: "lg" },
  { href: "/plan", label: "Plan", icon: ListTodo, placement: "lg" },
  { href: "/interventions", label: "Interventions", icon: HeartHandshake, placement: "xl" },
  { href: "/handouts", label: "Handouts", icon: FileText, placement: "xl" },
  { href: "/referrals", label: "Referrals", icon: MapPin, placement: "xl" },
  { href: "/medications", label: "Medications", icon: Pill, placement: "more" },
  { href: "/ethics", label: "Ethics & Legal", icon: Scale, placement: "more" },
];

const OTHER_NAV: readonly Omit<NavItem, "placement">[] = [
  { href: "/client", label: "Client mode", icon: Users },
  { href: "/about", label: "About", icon: Info },
];

/** Client-facing pages: client mode and the public share pages (/r/<handout id>) a client opens from a link. */
export function isClientPath(pathname: string | null): boolean {
  if (!pathname) return false;
  return pathname === "/client" || pathname.startsWith("/client/") || pathname.startsWith("/r/");
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
      <span className="max-w-[9.5rem] text-sm font-bold leading-tight text-primary sm:max-w-none sm:text-base lg:max-w-[10.5rem] dark:text-text">
        Clinician Resource Companion
      </span>
    </Link>
  );
}

/**
 * Client mode (G3): no clinician switch a client could tap by accident. A quiet "Clinician view" control asks
 * first, because the clinician screens show this session's notes, possible diagnoses, codes and scores.
 */
function ClinicianViewButton() {
  const [open, setOpen] = React.useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "font-medium text-muted")}>
        Clinician view
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Return to clinician view?</DialogTitle>
        <DialogDescription>Clinical notes from this session will be visible on this screen.</DialogDescription>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <DialogClose asChild>
            <Button type="button">Stay in client mode</Button>
          </DialogClose>
          <Link href="/symptoms" onClick={() => setOpen(false)} className={buttonVariants({ variant: "outline" })}>
            Return to clinician view
          </Link>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ wide screens */

const barLink =
  "flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-sm font-medium text-muted hover:bg-surface-2 hover:text-text";
const barActive = "bg-accent-soft font-semibold text-accent hover:bg-accent-soft hover:text-accent";

function MoreMenu({ pathname }: { pathname: string | null }) {
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLLIElement>(null);
  const buttonRef = React.useRef<HTMLButtonElement>(null);
  const listId = React.useId();

  React.useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const moreItems = CLINICIAN_NAV.filter((n) => n.placement !== "lg");
  const activeMore = moreItems.find((n) => isActive(pathname, n.href));
  const close = () => setOpen(false);

  return (
    <li
      ref={rootRef}
      className="relative"
      onBlur={(e) => {
        if (open && !rootRef.current?.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          barLink,
          activeMore &&
            (activeMore.placement === "xl"
              ? "lg:bg-accent-soft lg:font-semibold lg:text-accent xl:bg-transparent xl:font-medium xl:text-muted"
              : barActive),
        )}
      >
        More
        <ChevronDown aria-hidden className={cn("size-4 transition-transform", open && "rotate-180")} />
      </button>
      <div
        id={listId}
        hidden={!open}
        className="absolute right-0 top-full z-50 mt-1 w-60 rounded-xl border border-border bg-surface p-1.5 shadow-lg"
      >
        <ul className="space-y-0.5">
          {moreItems.map((n) => {
            const active = isActive(pathname, n.href);
            return (
              <li key={n.href} className={n.placement === "xl" ? "xl:hidden" : undefined}>
                <Link
                  href={n.href}
                  onClick={close}
                  aria-current={active ? "page" : undefined}
                  className={cn(barLink, "w-full", active && barActive)}
                >
                  <n.icon aria-hidden className="size-4 shrink-0" />
                  {n.label}
                </Link>
              </li>
            );
          })}
        </ul>
        <ul className="mt-1 border-t border-border pt-1">
          {OTHER_NAV.map((n) => {
            const active = isActive(pathname, n.href);
            return (
              <li key={n.href}>
                <Link
                  href={n.href}
                  onClick={close}
                  aria-current={active ? "page" : undefined}
                  className={cn(barLink, "w-full", active && barActive)}
                >
                  <n.icon aria-hidden className="size-4 shrink-0" />
                  {n.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </li>
  );
}

function DesktopNav({ pathname }: { pathname: string | null }) {
  return (
    <nav aria-label="Main" className="hidden min-w-0 lg:block">
      <ul className="flex items-center gap-1">
        {CLINICIAN_NAV.filter((n) => n.placement !== "more").map((n) => {
          const active = isActive(pathname, n.href);
          return (
            <li key={n.href} className={n.placement === "xl" ? "hidden xl:block" : undefined}>
              <Link href={n.href} aria-current={active ? "page" : undefined} className={cn(barLink, active && barActive)}>
                {n.label}
              </Link>
            </li>
          );
        })}
        <MoreMenu pathname={pathname} />
      </ul>
    </nav>
  );
}

/* ------------------------------------------------------------------ small screens */

function DrawerLink({ item, pathname, onNavigate }: { item: Omit<NavItem, "placement">; pathname: string | null; onNavigate: () => void }) {
  const active = isActive(pathname, item.href);
  return (
    <li>
      <Link
        href={item.href}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex min-h-12 items-center gap-3 rounded-lg px-3 text-base font-medium text-text hover:bg-surface-2",
          active && "bg-accent-soft font-semibold text-accent hover:bg-accent-soft",
        )}
      >
        <item.icon aria-hidden className="size-5 shrink-0" />
        {item.label}
      </Link>
    </li>
  );
}

/** Menu button + drawer (Radix Dialog: focus trap, Escape closes, focus returns to the button). */
function MobileNav({ pathname }: { pathname: string | null }) {
  const [open, setOpen] = React.useState(false);
  const current = [...CLINICIAN_NAV, ...OTHER_NAV].find((n) => isActive(pathname, n.href));
  const toolsId = React.useId();
  const moreId = React.useId();
  const close = () => setOpen(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-lg border border-border bg-surface-2 px-3 text-sm font-semibold text-text hover:bg-surface lg:hidden">
        <Menu aria-hidden className="size-5" />
        Menu
        {current ? <span className="sr-only">, current page: {current.label}</span> : null}
      </DialogTrigger>
      <DialogContent closeLabel="Close menu">
        <DialogTitle>Menu</DialogTitle>
        <DialogDescription>Clinician tools, client mode and about this app.</DialogDescription>
        {/* G9: crisis help stays one tap away while the menu covers the page. */}
        <div className="mt-4">
          <CrisisButton inline />
        </div>
        <nav aria-label="Main" className="mt-4 space-y-4">
          <div>
            <p id={toolsId} className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-muted">
              Clinician tools
            </p>
            <ul aria-labelledby={toolsId} className="grid gap-0.5 sm:grid-cols-2">
              {CLINICIAN_NAV.map((n) => (
                <DrawerLink key={n.href} item={n} pathname={pathname} onNavigate={close} />
              ))}
            </ul>
          </div>
          <div className="border-t border-border pt-3">
            <p id={moreId} className="sr-only">
              Other
            </p>
            <ul aria-labelledby={moreId} className="grid gap-0.5 sm:grid-cols-2">
              {OTHER_NAV.map((n) => (
                <DrawerLink key={n.href} item={n} pathname={pathname} onNavigate={close} />
              ))}
            </ul>
          </div>
        </nav>
      </DialogContent>
    </Dialog>
  );
}

/** Banner landmark: brand, navigation, crisis button, privacy banner. */
export function SiteHeader() {
  const pathname = usePathname();
  const client = isClientPath(pathname);
  // A share page (/r/<id>) opens on the client's own device: no mode control at all.
  const sharePage = pathname?.startsWith("/r/") ?? false;
  return (
    <header id="site-header" className="border-b border-border bg-surface">
      <a
        href="#main"
        className="sr-only z-[60] rounded-lg bg-primary-solid px-4 py-3 font-semibold text-primary-solid-fg focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:px-4 focus:py-3 focus:shadow-lg"
      >
        Skip to main content
      </a>
      <div className="mx-auto flex max-w-6xl items-center gap-x-3 px-4 py-2 lg:gap-x-4">
        <Brand />
        {client ? (
          <p className="hidden text-sm font-medium text-muted sm:block lg:flex-1">Self-help · plain language</p>
        ) : (
          <div className="hidden min-w-0 lg:block lg:flex-1">
            <DesktopNav pathname={pathname} />
          </div>
        )}
        <div className="ml-auto flex items-center gap-2 lg:ml-0">
          {client ? sharePage ? null : <ClinicianViewButton /> : <MobileNav pathname={pathname} />}
          <CrisisButton plain={client} />
        </div>
      </div>
      <PrivacyBar client={client} />
    </header>
  );
}
