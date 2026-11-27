/** Route helpers shared by the shell (header, footer, error and 404 pages). Pure, server-safe. */

/** Home of client mode; client chrome links here instead of the clinician home (G3). */
export const CLIENT_HOME = "/client";

/** Client-facing pages: client mode and the public share pages (/r/<handout id>) a client opens from a link. */
export function isClientPath(pathname: string | null): boolean {
  if (!pathname) return false;
  return pathname === CLIENT_HOME || pathname.startsWith(`${CLIENT_HOME}/`) || pathname.startsWith("/r/");
}

/** Share pages open on the client's own device: no way back into clinician screens at all. */
export function isSharePath(pathname: string | null): boolean {
  return pathname?.startsWith("/r/") ?? false;
}

/** Whether a nav link is the current page. `exact` for section homes such as /client. */
export function isActive(pathname: string | null, href: string, exact = false): boolean {
  if (!pathname) return false;
  return pathname === href || (!exact && pathname.startsWith(`${href}/`));
}
