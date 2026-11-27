// @vitest-environment jsdom
/**
 * App shell (jsdom): the EN/ES toggle switches the header, navigation, privacy bar, crisis button and dialog and
 * the footer disclaimer, and sets <html lang>; large text toggles a root attribute; client pages get the client
 * chrome (client navigation with Calm, client disclaimer, logo to the client home, no clinician switch on share
 * pages); the clinician menu lists Tools and keeps crisis help inside it. Nothing is written to browser storage.
 */
import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { LangProvider } from "@/lib/i18n/core";
import { CLIENT_DISCLAIMER, DISCLAIMER } from "@/lib/i18n/shell";
import { SessionProvider } from "@/state/session";
import { TextSizeProvider } from "@/components/layout/display-controls";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { NotFoundContent } from "@/components/layout/not-found-content";

let pathname = "/symptoms";
vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn() }),
}));

function Shell({ children }: { children?: React.ReactNode }) {
  return (
    <LangProvider>
      <TextSizeProvider>
        <SessionProvider>
          <SiteHeader />
          <main id="main">{children}</main>
          <SiteFooter />
        </SessionProvider>
      </TextSizeProvider>
    </LangProvider>
  );
}

const banner = () => screen.getByRole("banner");
const footer = () => screen.getByRole("contentinfo");

let storageWrites: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  storageWrites = vi.spyOn(Storage.prototype, "setItem");
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
    },
  );
});
afterEach(() => {
  cleanup();
  expect(storageWrites).not.toHaveBeenCalled();
  expect(document.cookie).toBe("");
  storageWrites.mockRestore();
  vi.unstubAllGlobals();
  document.documentElement.lang = "en";
  delete document.documentElement.dataset.textSize;
});

describe("language toggle", () => {
  it("switches the clinician shell to Spanish and back, and sets <html lang>", () => {
    pathname = "/symptoms";
    render(<Shell />);
    expect(footer().textContent).toContain(DISCLAIMER.en);
    expect(within(banner()).getByText("Do not enter names or identifying details.")).toBeTruthy();

    fireEvent.click(within(banner()).getByRole("button", { name: "Español" }));
    expect(document.documentElement.lang).toBe("es");
    expect(footer().textContent).toContain(DISCLAIMER.es);
    expect(within(banner()).getByText("No escriba nombres ni datos de identificación.")).toBeTruthy();
    expect(within(banner()).getByRole("button", { name: "Borrar sesión" })).toBeTruthy();
    expect(within(banner()).getByRole("navigation", { name: "Principal" })).toBeTruthy();
    expect(within(banner()).getByRole("link", { name: "Síntomas" }).getAttribute("aria-current")).toBe("page");

    const english = within(banner()).getByRole("button", { name: "English" });
    expect(english.getAttribute("lang")).toBe("en");
    fireEvent.click(english);
    expect(document.documentElement.lang).toBe("en");
    expect(footer().textContent).toContain(DISCLAIMER.en);
  });

  it("opens the crisis dialog in Spanish with call links and the Spanish-language 988 note", () => {
    pathname = "/measures";
    render(<Shell />);
    fireEvent.click(within(banner()).getByRole("button", { name: "Español" }));
    fireEvent.click(screen.getByRole("button", { name: "Ayuda en crisis" }));
    const dialog = screen.getByRole("dialog", { name: "Apoyo en crisis" });
    expect(within(dialog).getByRole("link", { name: "Llamar al 911" }).getAttribute("href")).toBe("tel:911");
    expect(within(dialog).getByRole("link", { name: "Llamar al 988" }).getAttribute("href")).toBe("tel:988");
    expect(within(dialog).getByRole("link", { name: "Enviar texto al 988" }).getAttribute("href")).toBe("sms:988");
    expect(dialog.textContent).toContain("pida atención en español");
    expect(within(dialog).getByRole("link", { name: /findahelpline\.com/ })).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "Cerrar" })).toBeTruthy();
  });
});

describe("large text", () => {
  it("is a pressed toggle that scales the root and is not saved", () => {
    pathname = "/";
    render(<Shell />);
    const toggle = within(banner()).getByRole("button", { name: "Large text" });
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    expect(document.documentElement.dataset.textSize).toBe("large");
    fireEvent.click(toggle);
    expect(document.documentElement.dataset.textSize).toBeUndefined();
  });
});

describe("client chrome", () => {
  it("uses client navigation, the client disclaimer and a logo link to the client home", () => {
    pathname = "/client/topics/stress";
    render(<Shell />);
    expect(screen.queryByRole("navigation", { name: "Main" })).toBeNull();
    const nav = within(banner()).getAllByRole("navigation", { name: "Self-help" });
    const hrefs = nav.flatMap((n) => within(n).getAllByRole("link").map((a) => a.getAttribute("href")));
    expect(hrefs).toEqual(expect.arrayContaining(["/client", "/client/calm", "/client/skills", "/client/help"]));
    expect(within(banner()).getByRole("link", { name: "Self-help" }).getAttribute("href")).toBe("/client");
    expect(within(banner()).getByRole("button", { name: "Clinician view" })).toBeTruthy();
    expect(within(banner()).getByRole("button", { name: "Get help now" })).toBeTruthy();
    expect(within(banner()).getByText("Please do not type your name or other personal details.")).toBeTruthy();

    expect(footer().textContent).toContain(CLIENT_DISCLAIMER.en);
    expect(footer().textContent).not.toContain("For licensed clinicians");
    expect(within(footer()).getByRole("link", { name: "Where to get help" }).getAttribute("href")).toBe("/client/help");
    expect(within(footer()).queryByRole("link", { name: /About/ })).toBeNull();

    fireEvent.click(within(banner()).getByRole("button", { name: "Español" }));
    expect(footer().textContent).toContain(CLIENT_DISCLAIMER.es);
    expect(within(banner()).getAllByRole("link", { name: "Calma" }).length).toBeGreaterThan(0);
  });

  it("has no clinician switch on share pages", () => {
    pathname = "/r/pmr-homework";
    render(<Shell />);
    expect(within(banner()).queryByRole("button", { name: "Clinician view" })).toBeNull();
    expect(within(banner()).getByRole("button", { name: "Get help now" })).toBeTruthy();
    expect(footer().textContent).toContain(CLIENT_DISCLAIMER.en);
  });

  it("asks before returning to the clinician view", () => {
    pathname = "/client";
    render(<Shell />);
    fireEvent.click(within(banner()).getByRole("button", { name: "Clinician view" }));
    const dialog = screen.getByRole("dialog", { name: "Return to clinician view?" });
    expect(within(dialog).getByRole("link", { name: "Return to clinician view" }).getAttribute("href")).toBe("/symptoms");
  });
});

describe("clinician menu", () => {
  it("lists Tools and the other screens, with crisis help inside the menu", () => {
    pathname = "/tools";
    render(<Shell />);
    fireEvent.click(within(banner()).getByRole("button", { name: /^Menu, current page: Tools$/ }));
    const drawer = screen.getByRole("dialog", { name: "Menu" });
    const tools = within(drawer).getByRole("link", { name: "Tools" });
    expect(tools.getAttribute("href")).toBe("/tools");
    expect(tools.getAttribute("aria-current")).toBe("page");
    for (const label of ["Symptoms", "Diagnoses", "Plan", "Referrals", "Ethics & Legal", "Client mode", "About"]) {
      expect(within(drawer).getByRole("link", { name: label })).toBeTruthy();
    }
    expect(within(drawer).getByRole("button", { name: "Crisis help" })).toBeTruthy();
  });

  it("puts Tools in the wide-screen More menu", () => {
    pathname = "/";
    render(<Shell />);
    const nav = within(banner()).getByRole("navigation", { name: "Main" });
    fireEvent.click(within(nav).getByRole("button", { name: "More" }));
    expect(within(nav).getByRole("link", { name: "Tools" }).getAttribute("href")).toBe("/tools");
  });
});

describe("idle warning and Clear session in Spanish", () => {
  it("clears with a short phone label and announces it in Spanish", () => {
    vi.useFakeTimers();
    try {
      pathname = "/symptoms";
      render(<Shell />);
      fireEvent.click(within(banner()).getByRole("button", { name: "Español" }));
      fireEvent.click(within(banner()).getByRole("button", { name: "Borrar sesión" }));
      expect(screen.getByRole("status").textContent).toBe("Sesión borrada. No se guardó nada.");
      act(() => void vi.advanceTimersByTime(14 * 60 * 1000));
      expect(screen.getByRole("alert").textContent).toContain("esta sesión se borrará en 60 segundos");
      expect(within(screen.getByRole("alert")).getByRole("button", { name: "Seguir trabajando" })).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("not-found page", () => {
  it("offers only client pages on a client path", () => {
    pathname = "/r/no-such-handout";
    render(<Shell>{<NotFoundContent />}</Shell>);
    const main = screen.getByRole("main");
    const hrefs = within(main).getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(["/client", "/client/help"]);
  });

  it("offers clinician pages elsewhere", () => {
    pathname = "/no-such-page";
    render(<Shell>{<NotFoundContent />}</Shell>);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("This page does not exist");
    const hrefs = within(screen.getByRole("main")).getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(["/", "/symptoms", "/client"]);
  });
});
