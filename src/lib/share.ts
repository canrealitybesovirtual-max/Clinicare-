/**
 * Share links for client handouts (spec section 3 screen 6 and section 11: "public resource URLs and QR codes
 * containing only resource IDs").
 *
 * A share link is exactly `<origin>/r/<handout id>`:
 * - the id must be one of the handouts in the content library (src/lib/library.ts), so nothing else can ride along;
 * - no query string, no fragment, no credentials, no extra path segments: no client data, no clinician data, no
 *   typed text, no tracking parameters (G5);
 * - the origin is the app's own origin (window.location.origin in the browser), validated as a bare http(s) origin.
 *
 * Isomorphic and pure apart from reading window.location.origin when no origin is passed. Importing this module
 * pulls in the content library, so use it in server components (sharePath) and pass the path to client components,
 * which only prefix the current origin (src/components/handouts/share-link.ts).
 */
import { allHandouts } from "./library";

/** Route prefix of the public, client-facing handout pages (src/app/r/[id]). */
export const SHARE_ROUTE = "/r";

/** Same shape as content ids (kebab-case), checked before the library lookup. */
const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const SHAREABLE: ReadonlySet<string> = new Set(allHandouts.map((h) => h.id));

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

/** "/r/<id>" for a library handout; throws ShareLinkError for anything else. */
export function sharePath(id: string): string {
  if (!isShareableHandoutId(id)) throw new ShareLinkError("not a handout in the library");
  return `${SHARE_ROUTE}/${id}`;
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
 * The result contains the handout id and nothing else.
 */
export function shareUrl(id: string, origin?: string): string {
  const path = sharePath(id);
  const base = origin ?? (typeof window !== "undefined" ? window.location.origin : undefined);
  if (!base) throw new ShareLinkError("no origin available");
  const o = normalizeOrigin(base);
  const url = new URL(path, `${o}/`);
  if (url.origin !== o || url.pathname !== path || url.search || url.hash) throw new ShareLinkError("unexpected link shape");
  return url.href;
}
