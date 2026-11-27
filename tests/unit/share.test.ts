import { describe, expect, it } from "vitest";
import { allHandouts } from "@/lib/library";
import {
  SHARE_ROUTE,
  ShareLinkError,
  isShareableHandoutId,
  normalizeOrigin,
  shareUrl,
  sharePath,
  shareableHandoutIds,
} from "@/lib/share";
import { absoluteShareUrl } from "@/components/handouts/share-link";

const ORIGIN = "https://companion.example.org";

describe("shareUrl (src/lib/share.ts)", () => {
  it("accepts every handout in the content library and nothing else", () => {
    expect(shareableHandoutIds()).toEqual(allHandouts.map((h) => h.id).sort());
    expect(shareableHandoutIds().length).toBeGreaterThan(0);
    for (const h of allHandouts) expect(isShareableHandoutId(h.id)).toBe(true);
  });

  it("produces exactly <origin>/r/<id> for library ids", () => {
    for (const h of allHandouts) {
      const url = shareUrl(h.id, ORIGIN);
      expect(url).toBe(`${ORIGIN}${SHARE_ROUTE}/${h.id}`);
      const u = new URL(url);
      expect(u.origin).toBe(ORIGIN);
      expect(u.pathname).toBe(`/r/${h.id}`);
      expect(u.search).toBe("");
      expect(u.hash).toBe("");
      expect(u.username + u.password).toBe("");
      expect(sharePath(h.id)).toBe(`/r/${h.id}`);
    }
  });

  it("works on localhost origins with a port, and normalizes a trailing slash", () => {
    expect(shareUrl("pmr-homework", "http://localhost:3000")).toBe("http://localhost:3000/r/pmr-homework");
    expect(shareUrl("pmr-homework", `${ORIGIN}/`)).toBe(`${ORIGIN}/r/pmr-homework`);
  });

  it("refuses ids that are not library handouts", () => {
    const bad = [
      "",
      "not-a-handout",
      "PMR-HOMEWORK",
      "pmr-homework ",
      " pmr-homework",
      "pmr-homework?name=Jane",
      "pmr-homework#x",
      "pmr-homework/extra",
      "../pmr-homework",
      "pmr-homework/../admin",
      "%2e%2e%2fpmr-homework",
      "pmr_homework",
      "gad-7", // a measure, not a handout
      "generalized-anxiety-disorder", // a condition, not a handout
      "pmr-homework\n",
      "Jane Doe",
      "555-12-3456",
    ];
    for (const id of bad) {
      expect(isShareableHandoutId(id)).toBe(false);
      expect(() => shareUrl(id, ORIGIN)).toThrow(ShareLinkError);
      expect(() => sharePath(id)).toThrow(ShareLinkError);
    }
    for (const v of [undefined, null, 42, {}, ["pmr-homework"]]) expect(isShareableHandoutId(v)).toBe(false);
  });

  it("refuses origins that carry anything beyond scheme, host and port", () => {
    const bad = [
      "companion.example.org",
      "ftp://companion.example.org",
      "javascript:alert(1)",
      "data:text/html,hi",
      `${ORIGIN}/path`,
      `${ORIGIN}?client=Jane`,
      `${ORIGIN}#frag`,
      "https://user:pass@companion.example.org",
      "not a url",
    ];
    for (const o of bad) {
      expect(() => normalizeOrigin(o)).toThrow(ShareLinkError);
      expect(() => shareUrl("pmr-homework", o)).toThrow(ShareLinkError);
    }
  });

  it("puts nothing but the handout id in the link (no title, content or session data)", () => {
    for (const h of allHandouts) {
      const tail = shareUrl(h.id, ORIGIN).slice(ORIGIN.length);
      expect(tail).toBe(`/r/${h.id}`);
      expect(tail).not.toContain(encodeURIComponent(h.title));
      expect(tail).toMatch(/^\/r\/[a-z0-9-]+$/);
    }
  });

  it("throws without an origin outside the browser", () => {
    expect(typeof window).toBe("undefined");
    expect(() => shareUrl("pmr-homework")).toThrow(ShareLinkError);
  });
});

describe("absoluteShareUrl (browser half, src/components/handouts/share-link.ts)", () => {
  it("prefixes the origin to a validated share path", () => {
    for (const h of allHandouts) expect(absoluteShareUrl(sharePath(h.id), ORIGIN)).toBe(shareUrl(h.id, ORIGIN));
  });

  it("refuses anything that is not exactly /r/<id> on a bare origin", () => {
    for (const p of ["/r/", "/r/a/b", "/r/A", "/r/pmr-homework?x=1", "/r/pmr-homework#x", "/handouts/pmr-homework", "r/pmr-homework", "//evil.example/r/x", "/r/../x"]) {
      expect(absoluteShareUrl(p, ORIGIN)).toBeNull();
    }
    for (const o of [`${ORIGIN}/x`, `${ORIGIN}?a=1`, "https://u:p@example.org", "javascript:x", "nope"]) {
      expect(absoluteShareUrl("/r/pmr-homework", o)).toBeNull();
    }
  });
});
