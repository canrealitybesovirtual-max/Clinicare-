// @vitest-environment jsdom
/**
 * Client mode screens (jsdom), in English and Spanish:
 * - the handout view has a visible "Language / Idioma" switch that changes the handout, its labels and its PDF button,
 *   and the Spanish share page (/r/<id>/es) opens in Spanish and switches the shell to Spanish;
 * - the home, skills, help and topic screens follow the shell language;
 * - the topic screen sends only the topic id, a language code and a count, and replaces a diagnosis-named title;
 * - no client screen shows a condition name, ICD code or scoring word, in either language (G3);
 * - crisis help is on every screen, in both languages (G9); nothing is written to browser storage (G5).
 */
import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { LangProvider, useLang, type Lang } from "@/lib/i18n/core";
import { SessionProvider } from "@/state/session";
import { allConditions, allHandouts, getAnyHandout } from "@/lib/library";
import type { Handout } from "@/lib/schemas";
import { ClientHandoutView } from "@/components/client/client-handout-view";
import { ClientHome } from "@/components/client/client-home";
import { ClientSkillsView } from "@/components/client/client-skills-view";
import { ClientHelpView } from "@/components/client/client-help-view";
import { ClientTopicView } from "@/components/client/client-topic-view";
import { helpRegions } from "@/components/client/help-directory";
import { getClientTopic, groupClientTopics } from "@/components/client/topics";
import { clipText, handoutTitle } from "@/components/handouts/localize";

vi.mock("next/navigation", () => ({
  usePathname: () => "/client",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn() }),
}));

/** Sets the shell language once, like the header switch would. */
function SetLang({ lang }: { lang: Lang }) {
  const { setLang } = useLang();
  React.useEffect(() => setLang(lang), [lang, setLang]);
  return null;
}

function Providers({ lang = "en", children }: { lang?: Lang; children: React.ReactNode }) {
  return (
    <LangProvider>
      <SessionProvider>
        <SetLang lang={lang} />
        {children}
      </SessionProvider>
    </LangProvider>
  );
}

const ICD_RE = /\b[A-Z]\d{2}\.\d|\b6[A-E]\d{2}\b/;
const SCORING_RE = /\b(GAD-7|PHQ-9|score|scores|scored|severity|diagnos\w*|disorder)\b|trastorno|diagn[oó]stic|puntuaci/i;

function expectClientSafe(label: string) {
  const text = document.body.textContent ?? "";
  expect(text, label).not.toMatch(ICD_RE);
  expect(text, label).not.toMatch(SCORING_RE);
  const lower = text.toLowerCase();
  for (const c of allConditions) expect(lower, `${label}: ${c.name}`).not.toContain(c.name.toLowerCase());
}

function expectCrisisHelp(label: string) {
  const tel = [...document.querySelectorAll<HTMLAnchorElement>("a[href^='tel:']")].map((a) => a.getAttribute("href"));
  expect(tel, label).toEqual(expect.arrayContaining(["tel:988", "tel:911"]));
  expect(document.body.textContent, label).toContain("findahelpline.com");
}

const pmr = getAnyHandout("pmr-homework") as Handout;
const BACK = { href: "/client", label: { en: "More self-help", es: "Más autoayuda" } };

let storageWrites: ReturnType<typeof vi.spyOn>;
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  storageWrites = vi.spyOn(Storage.prototype, "setItem");
  fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as { topic: string; lang: "en" | "es" };
    const items = [
      // Upstream titles can name a diagnosis: the client screen must replace this one with its plain alt title.
      { title: "Generalized Anxiety Disorder", altTitles: ["Worry and nerves"], url: "https://medlineplus.gov/a.html", summary: "Anxiety disorder overview.", groups: [] },
      { title: body.lang === "es" ? "Estrés (prueba)" : "Stress (test)", altTitles: [], url: "https://medlineplus.gov/b.html", summary: "Ways to cope.", groups: [] },
    ];
    return {
      json: async () => ({
        ok: true,
        data: { topic: { id: body.topic, clientLabel: "x", page: "https://medlineplus.gov", sud: false, crisis: false }, language: body.lang, total: 2, items },
        attribution: "Information from MedlinePlus.gov",
        source: "https://medlineplus.gov/about/developers/webservices/",
      }),
    };
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  expect(storageWrites).not.toHaveBeenCalled();
  storageWrites.mockRestore();
  vi.unstubAllGlobals();
  document.documentElement.lang = "en";
});

describe("client handout view", () => {
  it("switches the handout, its labels and its print button between English and Spanish", () => {
    render(
      <Providers>
        <ClientHandoutView handout={pmr} back={BACK} />
      </Providers>,
    );
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(pmr.title);
    expect(screen.getByRole("button", { name: "Download to print" })).toBeTruthy();
    const group = screen.getByRole("group", { name: "Language / Idioma" });

    fireEvent.click(within(group).getByLabelText("Español"));
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(pmr.es?.title);
    expect(screen.getByRole("button", { name: "Descargar para imprimir" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1 }).closest("[lang]")?.getAttribute("lang")).toBe("es");
    expect(document.documentElement.lang).toBe("es");
    expect(document.body.textContent).toContain(pmr.es?.safetyNote ?? "missing");
    expect(document.body.textContent).toContain("Traducción hecha con ayuda de una computadora");
    expectCrisisHelp("handout es");

    fireEvent.click(within(group).getByLabelText("English"));
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(pmr.title);
  });

  it("opens in Spanish on the Spanish share page and moves the shell to Spanish", async () => {
    render(
      <Providers>
        <ClientHandoutView handout={pmr} back={BACK} initialLang="es" />
      </Providers>,
    );
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(pmr.es?.title);
    await waitFor(() => expect(document.documentElement.lang).toBe("es"));
    expect(screen.getByText("Más autoayuda")).toBeTruthy();
  });

  it.each(allHandouts.map((h) => [h.id, h] as const))("%s is client-safe and has crisis help in both languages", (_id, h) => {
    for (const lang of ["en", "es"] as const) {
      const { unmount } = render(
        <Providers lang={lang}>
          <ClientHandoutView handout={h} back={BACK} initialLang={lang} />
        </Providers>,
      );
      expectClientSafe(`${h.id} ${lang}`);
      expectCrisisHelp(`${h.id} ${lang}`);
      unmount();
    }
  });
});

describe("client home, skills and help", () => {
  const skills = allHandouts.map((h) => ({
    id: h.id,
    title: handoutTitle(h),
    intro: { en: clipText(h.intro, 140), es: h.es ? clipText(h.es.intro, 140) : undefined },
    minutes: h.estimatedMinutes,
    hasLog: Boolean(h.practiceLog),
  }));

  it.each(["en", "es"] as const)("follow the shell language (%s) and stay client-safe with crisis help", async (lang) => {
    const screens = [
      ["home", <ClientHome key="home" {...groupClientTopics()} featured={pmr} />, { en: "Help and skills you can use today", es: "Ayuda y ejercicios que puede usar hoy" }],
      ["skills", <ClientSkillsView key="skills" skills={skills} />, { en: "Skills you can practice", es: "Ejercicios que puede practicar" }],
      ["help", <ClientHelpView key="help" regions={helpRegions()} />, { en: "Where to get help", es: "Dónde buscar ayuda" }],
    ] as const;
    for (const [name, ui, h1] of screens) {
      const { unmount } = render(<Providers lang={lang}>{ui}</Providers>);
      await waitFor(() => expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(h1[lang]));
      // Disclosures (topic groups) open, so the whole list is checked.
      document.querySelectorAll("details").forEach((d) => (d.open = true));
      expectClientSafe(`${name} ${lang}`);
      if (name !== "skills") expectCrisisHelp(`${name} ${lang}`);
      unmount();
    }
  });

  it("lists the skills alphabetically in the language being read", async () => {
    render(
      <Providers lang="es">
        <ClientSkillsView skills={skills} />
      </Providers>,
    );
    await waitFor(() => expect(document.documentElement.lang).toBe("es"));
    const titles = screen.getAllByRole("link").map((a) => a.querySelector("span")?.textContent ?? "").filter(Boolean);
    const expected = allHandouts.map((h) => h.es?.title ?? h.title).sort((a, b) => a.localeCompare(b, "es"));
    expect(titles).toEqual(expected);
  });
});

describe("client topic view", () => {
  const topic = getClientTopic("anxiety");
  if (!topic) throw new Error("anxiety topic missing");
  const skills = topic.handoutIds.map((id) => {
    const h = getAnyHandout(id) as Handout;
    return { id, title: handoutTitle(h), minutes: h.estimatedMinutes };
  });

  it("shows the topic's skills, sends only the topic id, language and count, and replaces diagnosis titles", async () => {
    render(
      <Providers>
        <ClientTopicView topic={topic} skills={skills} />
      </Providers>,
    );
    await screen.findByText(/Information from MedlinePlus\.gov/);
    expect(screen.getByText("Worry and nerves")).toBeTruthy();
    expect(screen.queryByText("Anxiety disorder overview.")).toBeNull();
    for (const s of skills) expect(screen.getByText(s.title.en)).toBeTruthy();
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("/api/health-topics");
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({ topic: "anxiety", lang: "en", max: 5 });
    expectClientSafe("topic en");
    expectCrisisHelp("topic en");

    await act(async () => {
      fireEvent.click(within(screen.getByRole("group", { name: "Language / Idioma" })).getByLabelText("Español"));
    });
    await screen.findByText("Estrés (prueba)");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(topic.label.es);
    expect(screen.getByText("Ejercicios para probar")).toBeTruthy();
    expect(JSON.parse(String((fetchMock.mock.calls.at(-1)?.[1] as RequestInit).body))).toEqual({ topic: "anxiety", lang: "es", max: 5 });
    expectClientSafe("topic es");
    expectCrisisHelp("topic es");
  });
});
