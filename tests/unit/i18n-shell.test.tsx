/**
 * Shell wording (src/lib/i18n/shell.ts): every string has English and Spanish, both use the same {slots}, the
 * G14 disclaimers keep their fixed English sentences, every crisis country has a name in both languages, and the
 * i18n helpers fall back and fill as documented.
 */
import * as React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { fill, pick, type Text } from "@/lib/i18n/core";
import * as shell from "@/lib/i18n/shell";
import { crisisLines } from "@/components/crisis/crisis-data";

const slots = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

function allTexts(): [string, Text][] {
  const out: [string, Text][] = [];
  for (const [group, value] of Object.entries(shell)) {
    if (typeof value !== "object" || value === null) continue;
    if ("en" in value) {
      out.push([group, value as Text]);
      continue;
    }
    for (const [key, text] of Object.entries(value as Record<string, Text>)) out.push([`${group}.${key}`, text]);
  }
  return out;
}

describe("shell dictionary", () => {
  const texts = allTexts();

  it("covers the shell (header, nav, crisis, privacy, footer, errors)", () => {
    expect(texts.length).toBeGreaterThan(100);
  });

  it.each(texts)("%s has English and Spanish with the same placeholders", (_name, text) => {
    expect(text.en.trim().length).toBeGreaterThan(0);
    expect(text.es?.trim().length ?? 0).toBeGreaterThan(0);
    expect(slots(text.es ?? "")).toEqual(slots(text.en));
  });

  it("keeps the fixed G14 disclaimer sentences", () => {
    expect(shell.DISCLAIMER.en).toBe(
      "Resource only. Not a substitute for clinical judgment. Not a medical device. For licensed clinicians.",
    );
    expect(shell.CLIENT_DISCLAIMER.en.startsWith("Resource only. Not a substitute for clinical judgment.")).toBe(true);
    expect(shell.CLIENT_DISCLAIMER.en).toContain("not medical advice");
    expect(shell.CLIENT_DISCLAIMER.es).toContain("No es consejo médico");
    expect(shell.CLIENT_DISCLAIMER.en).not.toContain("licensed clinicians");
  });

  it("names every crisis-line country in both languages", () => {
    for (const c of crisisLines.countries) {
      const name = shell.COUNTRY_NAMES[c.country as keyof typeof shell.COUNTRY_NAMES];
      expect(name, c.country).toBeDefined();
      expect(name.es.length).toBeGreaterThan(0);
    }
  });

  it("does not name an unverified 988 menu option in Spanish", () => {
    for (const t of [shell.CRISIS.spanishUS, shell.FOOTER.crisisClinician, shell.ERRORS.usLine]) {
      expect(t.es).toContain("pida atención en español");
      expect(t.es).not.toMatch(/\b(marque|oprima|presione)\b/i);
    }
  });
});

describe("pick and fill", () => {
  it("falls back to English when a Spanish string is missing", () => {
    expect(pick({ en: "Save" }, "es")).toBe("Save");
    expect(pick({ en: "Save", es: "Guardar" }, "es")).toBe("Guardar");
    expect(pick("Plain", "es")).toBe("Plain");
  });

  it("fills slots with text or elements and leaves unknown slots as written", () => {
    const html = renderToStaticMarkup(
      <p>{fill("Llame al {line} o visite {site}. {unknown}", { line: <a href="tel:988">988</a>, site: "findahelpline.com" })}</p>,
    );
    expect(html).toBe('<p>Llame al <a href="tel:988">988</a> o visite findahelpline.com. {unknown}</p>');
    expect(React.isValidElement(fill("{n}", { n: 1 })[1])).toBe(true);
  });
});
