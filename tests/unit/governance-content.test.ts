/**
 * Content governance data: the curated item list a report can name, report links that carry only an item
 * reference and a reason code (never typed text, G5), the content changelog (every item it names exists), and
 * the discreet-page list for the quick exit (each path is a real page).
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CONTENT_TYPES, contentItems, findContentItem, itemRef } from "@/app/about/report/content-items";
import { REPORT_REASONS, REPORT_REMINDER, reportDestination, reportHref } from "@/app/about/report/report-link";
import { CHANGE_KINDS, CHANGELOG } from "@/app/about/changelog/entries";
import { DISCREET_PATHS, DISCREET_TITLE, QUICK_EXIT_URL, isDiscreetPath } from "@/components/layout/quick-exit";
import { getAnyHandout } from "@/lib/library";
import { CLIENT_TOPICS } from "@/components/client/topics";

const APP = path.resolve(__dirname, "../../src/app");
/** The page file that serves an in-app href such as "/interventions/x" or "/ethics#y". */
function routeExists(href: string): boolean {
  const parts = href.split("#")[0]!.split("/").filter(Boolean);
  const dirs = [path.join(APP, "(clinician)"), path.join(APP, "(client)"), APP];
  return dirs.some((root) => {
    let dir = root;
    for (const part of parts) {
      const exact = path.join(dir, part);
      dir = existsSync(exact) ? exact : path.join(dir, "[id]");
    }
    return existsSync(path.join(dir, "page.tsx"));
  });
}

describe("curated content items", () => {
  const items = contentItems();

  it("lists every content type with unique references and real pages", () => {
    const refs = items.map(itemRef);
    expect(new Set(refs).size).toBe(refs.length);
    for (const t of CONTENT_TYPES) expect(items.some((i) => i.type === t.type), t.type).toBe(true);
    for (const href of new Set(items.flatMap((i) => (i.href ? [i.href] : [])))) expect(routeExists(href), href).toBe(true);
    expect(items.every((i) => i.title.trim().length > 2)).toBe(true);
  });

  it("finds an item by reference and nothing outside the list", () => {
    const first = items[0]!;
    expect(findContentItem(itemRef(first))).toEqual(first);
    expect(findContentItem("handout/not-a-handout")).toBeUndefined();
    expect(findContentItem("<script>")).toBeUndefined();
  });
});

describe("report links", () => {
  it("accepts a valid email or https form and rejects anything else", () => {
    expect(reportDestination({})).toBeNull();
    expect(reportDestination({ CONTENT_REPORT_EMAIL: "not an email" })).toBeNull();
    expect(reportDestination({ CONTENT_REPORT_EMAIL: " content@example.org " })).toEqual({ kind: "email", address: "content@example.org" });
    expect(reportDestination({ CONTENT_REPORT_URL: "http://example.org/report" })).toBeNull();
    expect(reportDestination({ CONTENT_REPORT_URL: "https://user:pw@example.org/report" })).toBeNull();
    expect(reportDestination({ CONTENT_REPORT_URL: "https://example.org/report", CONTENT_REPORT_EMAIL: "content@example.org" })).toEqual({
      kind: "url",
      url: "https://example.org/report",
    });
  });

  it("builds a mailto that carries only the item reference, the reason code and the fixed reminder", () => {
    const href = reportHref({ kind: "email", address: "content@example.org" }, "handout/worry-log", "outdated");
    const u = new URL(href);
    expect(u.protocol).toBe("mailto:");
    expect(u.pathname).toBe("content@example.org");
    expect(u.searchParams.get("subject")).toBe("Content report: handout/worry-log");
    expect(u.searchParams.get("body")).toBe(`Item: handout/worry-log\r\nReason: outdated\r\n\r\n${REPORT_REMINDER}`);
    expect([...u.searchParams.keys()]).toEqual(["subject", "body"]);
  });

  it("adds only item and reason to a report form URL", () => {
    const u = new URL(reportHref({ kind: "url", url: "https://example.org/report?src=crc" }, "measure/phq-9", "safety"));
    expect(Object.fromEntries(u.searchParams)).toEqual({ src: "crc", item: "measure/phq-9", reason: "safety" });
  });

  it("uses curated, unique reason codes", () => {
    const codes = REPORT_REASONS.map((r) => r.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const c of codes) expect(c).toMatch(/^[a-z]+(-[a-z]+)*$/);
  });
});

describe("content changelog", () => {
  const today = new Date().toISOString().slice(0, 10);

  it("names only items that exist, once per entry", () => {
    for (const e of CHANGELOG) {
      expect(new Set(e.items).size, e.title).toBe(e.items.length);
      for (const ref of e.items) expect(findContentItem(ref), `${e.title}: ${ref}`).toBeDefined();
    }
  });

  it("has dated, kinded, unique entries and no future dates", () => {
    const keys = CHANGELOG.map((e) => `${e.date} ${e.title}`);
    expect(new Set(keys).size).toBe(keys.length);
    for (const e of CHANGELOG) {
      expect(e.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(e.date <= today, e.title).toBe(true);
      expect(CHANGE_KINDS).toContain(e.kind);
      expect(e.summary.length).toBeGreaterThan(40);
      if (e.link) expect(routeExists(e.link.href), e.link.href).toBe(true);
    }
  });
});

describe("discreet pages", () => {
  it("lists real relationship-safety pages and matches them with or without a trailing slash", () => {
    expect(CLIENT_TOPICS.some((t) => t.id === "relationship-safety")).toBe(true);
    expect(getAnyHandout("relationship-safety-help-card")).toBeDefined();
    for (const p of DISCREET_PATHS) {
      expect(routeExists(p), p).toBe(true);
      expect(isDiscreetPath(`${p}/`)).toBe(true);
    }
    expect(isDiscreetPath("/client/topics/anxiety")).toBe(false);
    expect(isDiscreetPath(null)).toBe(false);
  });

  it("leaves for a neutral https page and uses a title that names no topic", () => {
    expect(QUICK_EXIT_URL).toMatch(/^https:\/\//);
    expect(`${DISCREET_TITLE.en} ${DISCREET_TITLE.es}`).not.toMatch(/violen|abuse|safety|relationship|seguridad|pareja|violencia/i);
  });
});
