"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChevronDown,
  ClipboardList,
  FileText,
  HandHeart,
  HeartHandshake,
  House,
  Info,
  ListChecks,
  ListTodo,
  MapPin,
  Menu,
  Pill,
  Scale,
  Sparkles,
  TextSearch,
  Users,
  Wind,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { fill, useT, type Text } from "@/lib/i18n/core";
import { HEADER, NAV } from "@/lib/i18n/shell";
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
import { cn } from "@/lib/utils";
import { LanguageToggle, TextSizeToggle } from "./display-controls";
import { CLIENT_HOME, isActive, isClientPath, isSharePath } from "./paths";
import { PrivacyBar } from "./privacy-bar";

/** Re-exported for callers that already import it from here (the helpers live in ./paths). */
export { isClientPath } from "./paths";

/**
 * Where an item sits on wide screens: always in the bar ("lg"), in the bar from xl and in "More" below it ("xl"),
 * or always in "More" ("more"). Small screens show every item in the menu drawer.
 */
type Placement = "lg" | "xl" | "more";

interface NavItem {
  href: string;
  label: Text;
  icon: LucideIcon;
}

/** Clinician information architecture (spec section 3, screens 1-8, plus in-session tools). */
const CLINICIAN_NAV: readonly (NavItem & { placement: Placement })[] = [
  { href: "/symptoms", label: NAV.symptoms, icon: TextSearch, placement: "lg" },
  { href: "/diagnoses", label: NAV.diagnoses, icon: ListChecks, placement: "lg" },
  { href: "/measures", label: NAV.measures, icon: ClipboardList, placement: "lg" },
  { href: "/plan", label: NAV.plan, icon: ListTodo, placement: "lg" },
  { href: "/interventions", label: NAV.interventions, icon: HeartHandshake, placement: "xl" },
  { href: "/handouts", label: NAV.handouts, icon: FileText, placement: "xl" },
  { href: "/referrals", label: NAV.referrals, icon: MapPin, placement: "xl" },
  { href: "/medications", label: NAV.medications, icon: Pill, placement: "more" },
  { href: "/ethics", label: NAV.ethics, icon: Scale, placement: "more" },
  { href: "/tools", label: NAV.tools, icon: Wrench, placement: "more" },
];

const OTHER_NAV: readonly NavItem[] = [
  { href: CLIENT_HOME, label: NAV.clientMode, icon: Users },
  { href: "/about", label: NAV.about, icon: Info },
];

/** Client mode navigation (plain language). The client home is matched exactly so topic pages do not mark it. */
const CLIENT_NAV: readonly (NavItem & { exact?: boolean })[] = [
  { href: CLIENT_HOME, label: NAV.clientHome, icon: House, exact: true },
  { href: "/client/calm", label: NAV.calm, icon: Wind },
  { href: "/client/skills", label: NAV.skills, icon: Sparkles },
  { href: "/client/help", label: NAV.findHelp, icon: HandHeart },
];

/**
 * Logo link. Clinician pages link to the clinician home; client pages link to the client home, never to the
 * clinician screens (G3). The name is hidden where the bar needs the room (phones, and lg until 2xl on clinician
 * pages) but always stays in the accessible name.
 */
function Brand({ client }: { client: boolean }) {
  const t = useT();
  return (
    <Link href={client ? CLIENT_HOME : "/"} className="flex min-h-11 shrink-0 items-center gap-2.5 rounded-xl pr-1">
      {/* Local file, decorative: the link text names the app. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icons/icon.svg" alt="" width={36} height={36} className="size-9 shrink-0" />
      {client ? (
        <span className="sr-only text-base font-bold text-primary sm:not-sr-only dark:text-text">{t(HEADER.clientBrand)}</span>
      ) : (
        <span
          lang="en"
          className="sr-only text-base font-bold leading-tight text-primary sm:not-sr-only lg:sr-only 2xl:not-sr-only dark:text-text"
        >
          Clinician Resource Companion
        </span>
      )}
    </Link>
  );
}

/**
 * Client mode (G3): no clinician switch a client could tap by accident. A quiet "Clinician view" control asks
 * first, because the clinician screens show this session's notes, possible diagnoses, codes and scores.
 */
function ClinicianViewButton() {
  const t = useT();
  const [open, setOpen] = React.useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "shrink-0 font-medium text-muted")}>
        {t(HEADER.clinicianView)}
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>{t(HEADER.clinicianViewTitle)}</DialogTitle>
        <DialogDescription>{t(HEADER.clinicianViewBody)}</DialogDescription>
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <DialogClose asChild>
            <Button type="button">{t(HEADER.stayClient)}</Button>
          </DialogClose>
          <Link href="/symptoms" onClick={() => setOpen(false)} className={buttonVariants({ variant: "outline" })}>
            {t(HEADER.returnClinician)}
          </Link>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const barLink =
  "flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-xl px-3 text-sm font-medium text-muted hover:bg-surface-2 hover:text-text";
const barActive = "bg-accent-soft font-semibold text-accent hover:bg-accent-soft hover:text-accent";

/** Client mode links: a second row on small screens, inline in the bar from lg. */
function ClientNav({ pathname, className }: { pathname: string | null; className?: string }) {
  const t = useT();
  return (
    <nav aria-label={t(HEADER.clientNav)} className={className}>
      <ul className="flex flex-wrap items-center gap-1">
        {CLIENT_NAV.map((n) => {
          const active = isActive(pathname, n.href, n.exact);
          return (
            <li key={n.href}>
              <Link href={n.href} aria-current={active ? "page" : undefined} className={cn(barLink, "px-2.5", active && barActive)}>
                {/* Text only on phones, so the four links fit one row at 390px. */}
                <n.icon aria-hidden className="hidden size-4 shrink-0 sm:block" />
                {t(n.label)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/* ------------------------------------------------------------------ wide screens (clinician) */

function MoreMenu({ pathname }: { pathname: string | null }) {
  const t = useT();
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
  const item = (n: NavItem, className?: string) => {
    const active = isActive(pathname, n.href);
    return (
      <li key={n.href} className={className}>
        <Link href={n.href} onClick={close} aria-current={active ? "page" : undefined} className={cn(barLink, "w-full", active && barActive)}>
          <n.icon aria-hidden className="size-4 shrink-0" />
          {t(n.label)}
        </Link>
      </li>
    );
  };

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
        {t(HEADER.more)}
        <ChevronDown aria-hidden className={cn("size-4 transition-transform", open && "rotate-180")} />
      </button>
      <div
        id={listId}
        hidden={!open}
        className="absolute right-0 top-full z-50 mt-1.5 w-64 rounded-2xl border border-border bg-surface p-2 shadow-lg"
      >
        <ul className="space-y-0.5">{moreItems.map((n) => item(n, n.placement === "xl" ? "xl:hidden" : undefined))}</ul>
        <ul className="mt-1.5 space-y-0.5 border-t border-border pt-1.5">{OTHER_NAV.map((n) => item(n))}</ul>
      </div>
    </li>
  );
}

function DesktopNav({ pathname }: { pathname: string | null }) {
  const t = useT();
  return (
    <nav aria-label={t(HEADER.mainNav)} className="hidden min-w-0 flex-1 lg:block">
      <ul className="flex flex-wrap items-center gap-1">
        {CLINICIAN_NAV.filter((n) => n.placement !== "more").map((n) => {
          const active = isActive(pathname, n.href);
          return (
            <li key={n.href} className={n.placement === "xl" ? "hidden xl:block" : undefined}>
              <Link href={n.href} aria-current={active ? "page" : undefined} className={cn(barLink, active && barActive)}>
                {t(n.label)}
              </Link>
            </li>
          );
        })}
        <MoreMenu pathname={pathname} />
      </ul>
    </nav>
  );
}

/* ------------------------------------------------------------------ small screens (clinician) */

function DrawerLink({ item, pathname, onNavigate }: { item: NavItem; pathname: string | null; onNavigate: () => void }) {
  const t = useT();
  const active = isActive(pathname, item.href);
  return (
    <li>
      <Link
        href={item.href}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex min-h-12 items-center gap-3 rounded-xl px-3 text-base font-medium text-text hover:bg-surface-2",
          active && "bg-accent-soft font-semibold text-accent hover:bg-accent-soft",
        )}
      >
        <item.icon aria-hidden className="size-5 shrink-0" />
        {t(item.label)}
      </Link>
    </li>
  );
}

/**
 * Menu button + drawer (Radix Dialog: focus trap, Escape closes, focus returns to the button). Icon-only on phones
 * so the bar stays one row; the accessible name always starts with the visible word "Menu".
 */
function MobileNav({ pathname }: { pathname: string | null }) {
  const t = useT();
  const [open, setOpen] = React.useState(false);
  const current = [...CLINICIAN_NAV, ...OTHER_NAV].find((n) => isActive(pathname, n.href));
  const toolsId = React.useId();
  const moreId = React.useId();
  const close = () => setOpen(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-border bg-surface-2 px-2.5 text-sm font-semibold text-text hover:bg-surface sm:px-3 lg:hidden">
        <Menu aria-hidden className="size-5" />
        <span className="sr-only sm:not-sr-only">{t(HEADER.menu)}</span>
        {current ? <span className="sr-only">{fill(t(HEADER.currentPage), { page: t(current.label) })}</span> : null}
      </DialogTrigger>
      <DialogContent closeLabel={t(HEADER.closeMenu)}>
        <DialogTitle>{t(HEADER.menu)}</DialogTitle>
        <DialogDescription>{t(HEADER.menuDescription)}</DialogDescription>
        {/* G9: crisis help stays one tap away while the menu covers the page. */}
        <div className="mt-4">
          <CrisisButton inline />
        </div>
        <nav aria-label={t(HEADER.mainNav)} className="mt-4 space-y-4">
          <div>
            <p id={toolsId} className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-muted">
              {t(HEADER.clinicianTools)}
            </p>
            <ul aria-labelledby={toolsId} className="grid gap-0.5 sm:grid-cols-2">
              {CLINICIAN_NAV.map((n) => (
                <DrawerLink key={n.href} item={n} pathname={pathname} onNavigate={close} />
              ))}
            </ul>
          </div>
          <div className="border-t border-border pt-3">
            <p id={moreId} className="sr-only">
              {t(HEADER.other)}
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

/**
 * Banner landmark: brand, navigation, language and text-size controls, crisis button, privacy banner.
 * On a 390px phone the bar is one 44px row plus the one-line privacy banner (client pages add one row of links),
 * so the page's own input or result starts high on the screen.
 */
export function SiteHeader() {
  const pathname = usePathname();
  const t = useT();
  const client = isClientPath(pathname);
  return (
    <header id="site-header" className="border-b border-border bg-surface">
      <a
        href="#main"
        className="sr-only z-[60] rounded-xl bg-primary-solid px-4 py-3 font-semibold text-primary-solid-fg focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:px-4 focus:py-3 focus:shadow-lg"
      >
        {t(HEADER.skip)}
      </a>
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-2 gap-y-1 px-4 py-1.5 sm:gap-x-3 sm:px-6 lg:py-2">
        <Brand client={client} />
        {client ? (
          <ClientNav pathname={pathname} className="hidden min-w-0 flex-1 lg:block" />
        ) : (
          <DesktopNav pathname={pathname} />
        )}
        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          <LanguageToggle />
          <TextSizeToggle />
          {client ? isSharePath(pathname) ? null : <ClinicianViewButton /> : <MobileNav pathname={pathname} />}
          <CrisisButton plain={client} />
        </div>
      </div>
      {client ? (
        <div className="mx-auto max-w-6xl px-4 pb-1.5 sm:px-6 lg:hidden">
          <ClientNav pathname={pathname} />
        </div>
      ) : null}
      <PrivacyBar client={client} />
    </header>
  );
}
