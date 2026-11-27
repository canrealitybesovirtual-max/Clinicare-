/**
 * Browser half of the share link (src/lib/share.ts builds and validates the path on the server against the content
 * library). This only prefixes the current origin, after checking the path is still exactly "/r/<id>", so the
 * client bundle never has to load the content library. Pure; no network, no storage.
 */

const SHARE_PATH_RE = /^\/r\/[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** `<origin>/r/<id>`, or null when the path or origin is not exactly what a share link may be. */
export function absoluteShareUrl(path: string, origin: string): string | null {
  if (!SHARE_PATH_RE.test(path) || path.length > 84) return null;
  let o: URL;
  try {
    o = new URL(origin);
  } catch {
    return null;
  }
  if ((o.protocol !== "https:" && o.protocol !== "http:") || o.username || o.password) return null;
  if ((o.pathname !== "/" && o.pathname !== "") || o.search || o.hash) return null;
  const url = new URL(path, `${o.origin}/`);
  if (url.origin !== o.origin || url.pathname !== path || url.search || url.hash) return null;
  return url.href;
}
