// @vitest-environment jsdom
/**
 * Clinician handout page pieces (jsdom): one "Language / Idioma" choice drives the preview, the PDF and the share
 * link together. The Spanish PDF is built on the device with the Spanish title, and the Spanish share link is
 * /r/<id>/es with nothing else in it. The handout library card shows the "ES" availability badge.
 */
import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { LangProvider } from "@/lib/i18n/core";
import { SessionProvider } from "@/state/session";
import { getAnyHandout } from "@/lib/library";
import { sharePath } from "@/lib/share";
import type { Handout } from "@/lib/schemas";
import {
  HandoutLangControl,
  HandoutLangScope,
  HandoutPdfButton,
  HandoutPreview,
  HandoutShare,
  HandoutTranslationNote,
} from "@/components/handouts/handout-lang-scope";
import { HandoutLibrary } from "@/components/handouts/handout-library";
import { handoutCard } from "@/components/handouts/catalog";

const downloads: { bytes: Uint8Array; name: string }[] = [];
vi.mock("@/lib/download", () => ({
  downloadBytes: (bytes: Uint8Array, name: string) => downloads.push({ bytes, name }),
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/handouts/breathing-practice" }));

const h = getAnyHandout("breathing-practice") as Handout;

function Page() {
  return (
    <LangProvider>
      <SessionProvider>
        <HandoutLangScope handout={h} sharePaths={{ en: sharePath(h.id), es: sharePath(h.id, "es") }}>
          <HandoutLangControl />
          <HandoutPdfButton />
          <HandoutTranslationNote />
          <HandoutPreview />
          <HandoutShare />
        </HandoutLangScope>
      </SessionProvider>
    </LangProvider>
  );
}

beforeEach(() => {
  downloads.length = 0;
});
afterEach(() => cleanup());

describe("clinician handout language", () => {
  it("switches the preview, the PDF and the share link to Spanish together", async () => {
    render(<Page />);
    const link = screen.getByLabelText("Link to send") as HTMLInputElement;
    await waitFor(() => expect(link.value).toBe(`${window.location.origin}/r/${h.id}`));
    expect(screen.getByText(h.intro)).toBeTruthy();

    fireEvent.click(within(screen.getByRole("group", { name: "Language / Idioma" })).getByLabelText("Español"));
    await waitFor(() => expect(link.value).toBe(`${window.location.origin}/r/${h.id}/es`));
    expect(new URL(link.value).search + new URL(link.value).hash).toBe("");
    expect(screen.getByText(h.es?.intro ?? "missing")).toBeTruthy();
    expect(screen.getByText(h.es?.intro ?? "missing").closest("[lang]")?.getAttribute("lang")).toBe("es");
    expect(screen.getByText(/This link opens the Spanish version/)).toBeTruthy();
    expect(screen.getByText(/Spanish translation: machine-assisted, PENDING human review/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Download PDF (Español)" }));
    await waitFor(() => expect(downloads).toHaveLength(1));
    const [file] = downloads;
    expect(file?.name).toBe(`${h.es?.title}.pdf`);
    expect(new TextDecoder().decode(file?.bytes.slice(0, 5))).toBe("%PDF-");
  });

  it("prints the English PDF by default", async () => {
    render(<Page />);
    fireEvent.click(screen.getByRole("button", { name: "Download PDF" }));
    await waitFor(() => expect(downloads).toHaveLength(1));
    expect(downloads[0]?.name).toBe(`${h.title}.pdf`);
  });

  it("says plainly when a handout has no Spanish version and offers no switch", () => {
    const { es: _es, ...englishOnly } = h;
    render(
      <LangProvider>
        <HandoutLangScope handout={englishOnly as Handout} sharePaths={{ en: sharePath(h.id) }}>
          <HandoutLangControl />
        </HandoutLangScope>
      </LangProvider>,
    );
    expect(screen.getByText("English only. No Spanish version yet.")).toBeTruthy();
    expect(screen.queryByRole("group", { name: "Language / Idioma" })).toBeNull();
  });
});

describe("handout library card", () => {
  it("shows the ES badge for translated handouts and the review badge in neutral style", () => {
    const card = handoutCard(h);
    expect(card.hasSpanish).toBe(true);
    render(
      <LangProvider>
        <SessionProvider>
          <HandoutLibrary cards={[card]} practiceTypes={[]} interventions={[]} />
        </SessionProvider>
      </LangProvider>,
    );
    const article = screen.getByRole("article");
    expect(within(article).getByText("Spanish version available")).toBeTruthy();
    expect(within(article).getByText("ES")).toBeTruthy();
    const review = within(article).getByText(/Not yet clinically reviewed/);
    expect(review.className).toContain("bg-surface-2");
    expect(screen.getByText("1 handout is awaiting licensed clinical review.")).toBeTruthy();
  });
});
