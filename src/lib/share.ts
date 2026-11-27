/**
 * Share links for client handouts (spec section 3 screen 6 and section 11: "public resource URLs and QR codes
 * containing only resource IDs").
 *
 * A share link is exactly `<origin>/r/<handout id>`, or `<origin>/r/<handout id>/es` for the Spanish version:
 * - the id must be one of the handouts in the content library (src/lib/library.ts), so nothing else can ride along;
 * - the only other path segment allowed is the language code "es", and only for a handout with a Spanish translation;
 * - no query string, no fragment, no credentials: no client data, no clinician data, no typed text, no tracking
 *   parameters (G5);
 * - the origin is the app's own origin (window.location.origin in the browser), validated as a bare http(s) origin.
 *
 * Isomorphic and pure apart from reading window.location.origin when no origin is passed. Importing this module
 * pulls in the content library, so use it in server components (sharePath) and pass the path to client components,
 * which only prefix the current origin (src/components/handouts/share-link.ts).
 */
import { allHandouts } from "./library";
import type { Lang } from "./i18n/core";

/** Route prefix of the public, client-facing handout pages (src/app/r/[id]). */
export const SHARE_ROUTE = "/r";

/** Same shape as content ids (kebab-case), checked before the library lookup. */
const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const SHAREABLE: ReadonlySet<string> = new Set(allHandouts.map((h) => h.id));
const SPANISH: ReadonlySet<string> = new Set(allHandouts.filter((h) => h.es).map((h) => h.id));

export class ShareLinkError extends Error {
  constructor(reason: string) {
    super(`Share link refused: ${reason}`);
    this.name = "ShareLinkError";
  }
}

/** Every handout id that can be shared (sorted). */
export function shareableHandoutIds(): string[] {
  return [...SHAREABLE].sort();
}

/** True only for the id of a handout in the content library. */
export function isShareableHandoutId(id: unknown): id is string {
  return typeof id === "string" && id.length <= 80 && ID_RE.test(id) && SHAREABLE.has(id);
}

/** True when the handout has a Spanish version that a share link can open (/r/<id>/es). */
export function hasSpanishShare(id: string): boolean {
  return isShareableHandoutId(id) && SPANISH.has(id);
}

/** "/r/<id>" (or "/r/<id>/es") for a library handout; throws ShareLinkError for anything else. */
export function sharePath(id: string, lang: Lang = "en"): string {
  if (!isShareableHandoutId(id)) throw new ShareLinkError("not a handout in the library");
  if (lang === "en") return `${SHARE_ROUTE}/${id}`;
  if (!SPANISH.has(id)) throw new ShareLinkError("this handout has no Spanish version");
  return `${SHARE_ROUTE}/${id}/es`;
}

/** A bare http(s) origin ("https://example.org", "http://localhost:3000"); throws for anything with more in it. */
export function normalizeOrigin(origin: string): string {
  let u: URL;
  try {
    u = new URL(origin);
  } catch {
    throw new ShareLinkError("invalid origin");
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new ShareLinkError("origin must be http or https");
  if (u.username || u.password) throw new ShareLinkError("origin must not carry credentials");
  if ((u.pathname !== "/" && u.pathname !== "") || u.search || u.hash) throw new ShareLinkError("origin must not carry a path, query or fragment");
  return u.origin;
}

/**
 * Absolute share link for a library handout on the given origin (default: the current page's origin).
 * The result contains the handout id, and "/es" for the Spanish version, and nothing else.
 */
export function shareUrl(id: string, origin?: string, lang: Lang = "en"): string {
  const path = sharePath(id, lang);
  const base = origin ?? (typeof window !== "undefined" ? window.location.origin : undefined);
  if (!base) throw new ShareLinkError("no origin available");
  const o = normalizeOrigin(base);
  const url = new URL(path, `${o}/`);
  if (url.origin !== o || url.pathname !== path || url.search || url.hash) throw new ShareLinkError("unexpected link shape");
  return url.href;
}
