import "server-only";
/**
 * Shared normalisers for upstream reference text (MedlinePlus, WHO ICD-API, NLM).
 * Output is PLAIN TEXT only: the UI must render it as text (React escapes it), never as HTML.
 * No dependencies; every regex is bounded or lazy with a fixed terminator (no nested quantifiers).
 */

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ensp: " ", emsp: " ", thinsp: " ",
  ndash: "–", mdash: "—", hellip: "…", lsquo: "‘", rsquo: "’", ldquo: "“",
  rdquo: "”", laquo: "«", raquo: "»", bull: "•", middot: "·", deg: "°",
  copy: "©", reg: "®", trade: "™", sect: "§", para: "¶", times: "×",
  divide: "÷", plusmn: "±", le: "≤", ge: "≥", micro: "µ", frac12: "½",
  frac14: "¼", frac34: "¾", iexcl: "¡", iquest: "¿",
  aacute: "á", eacute: "é", iacute: "í", oacute: "ó", uacute: "ú", ntilde: "ñ",
  uuml: "ü", Aacute: "Á", Eacute: "É", Iacute: "Í", Oacute: "Ó", Uacute: "Ú",
  Ntilde: "Ñ", Uuml: "Ü", agrave: "à", egrave: "è", ccedil: "ç", ouml: "ö",
  auml: "ä", ecirc: "ê", ocirc: "ô",
};

function validCodePoint(cp: number): boolean {
  if (!Number.isInteger(cp) || cp <= 0 || cp > 0x10ffff) return false;
  if (cp >= 0xd800 && cp <= 0xdfff) return false; // lone surrogates
  if (cp < 0x20 && cp !== 0x09 && cp !== 0x0a && cp !== 0x0d) return false; // control chars
  return !(cp >= 0x7f && cp <= 0x9f);
}

/** Decode one level of XML/HTML character references. Unknown named entities are left as-is. */
export function decodeEntities(s: string): string {
  return s.replace(/&(#[xX][0-9a-fA-F]{1,6}|#[0-9]{1,7}|[A-Za-z][A-Za-z0-9]{1,31});/g, (match, body: string) => {
    if (body.startsWith("#")) {
      const hex = body[1] === "x" || body[1] === "X";
      const cp = hex ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return validCodePoint(cp) ? String.fromCodePoint(cp) : "";
    }
    return NAMED_ENTITIES[body] ?? match;
  });
}

/**
 * HTML fragment -> plain text: drops script/style/comments, strips every tag, decodes entities,
 * removes control characters and collapses whitespace.
 */
export function htmlToPlainText(html: string): string {
  return decodeEntities(
    html
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
      // Block-level tags separate words; inline tags (e.g. search-highlight <span>s) must not add spaces.
      .replace(/<\/?(?:p|br|hr|li|ul|ol|dl|dt|dd|h[1-6]|div|section|article|header|footer|table|thead|tbody|tr|td|th|blockquote|pre|figure|figcaption)\b[^<>]*>/gi, " ")
      .replace(/<\/?[A-Za-z][^<>]*>/g, ""),
  )
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Text that arrives XML-escaped AND contains HTML (e.g. MedlinePlus web service <content> values):
 * decode the XML layer first, then strip the HTML and decode its entities.
 */
export function xmlEscapedHtmlToPlainText(s: string): string {
  return htmlToPlainText(decodeEntities(s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")));
}

/** Clip to at most `max` characters, preferring a word boundary, ending with an ellipsis. */
export function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  const room = Math.max(1, max - 1);
  let cut = text.slice(0, room);
  const space = cut.lastIndexOf(" ");
  if (space > room - 60 && space > 0) cut = cut.slice(0, space);
  return `${cut.replace(/[\s,;:.–—-]+$/, "")}…`;
}

/**
 * Accept only an absolute https URL on an allowlisted host (exact or subdomain), with no credentials.
 * Returns the normalised URL string, or null.
 */
export function safeHttpsUrl(raw: string | undefined | null, allowedHosts: readonly string[]): string | null {
  if (!raw) return null;
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:" || u.username || u.password || u.port) return null;
  const host = u.hostname.toLowerCase();
  if (!allowedHosts.some((h) => host === h || host.endsWith(`.${h}`))) return null;
  return u.toString();
}
