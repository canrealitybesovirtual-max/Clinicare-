"use client";
import type { CSSProperties, ReactNode } from "react";
import { fill, pick, type Lang } from "@/lib/i18n/core";
import { DISCLAIMER, ERRORS } from "@/lib/i18n/shell";

/**
 * Root-level error fallback (G9, G14). Replaces the root layout when the layout itself fails (for example, a
 * content parse error at import). It must work with nothing else loaded, so it imports no content, no session
 * state and no global styles: only the plain shell wording. Crisis numbers are hard-coded and styled inline.
 * The language choice lived in the layout that failed, so the page shows English and Spanish together.
 * It shows no error details and logs nothing (an error could hold session text, G5).
 */

const box: CSSProperties = {
  border: "2px solid #b42318",
  borderRadius: 16,
  padding: "16px 20px",
  margin: "20px 0",
  background: "#fff8f5",
  color: "#1f2328",
};
const link: CSSProperties = { color: "#8f1c13", fontWeight: 700 };

function Section({ lang }: { lang: Lang }) {
  const t = (text: { en: string; es?: string }) => pick(text, lang);
  const a = (href: string, label: ReactNode, external = false) => (
    <a href={href} style={link} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
      {label}
    </a>
  );
  // One h1 for the page: the English heading; the Spanish section sits one level below it.
  const [Title, Sub] = lang === "en" ? (["h1", "h2"] as const) : (["h2", "h3"] as const);
  return (
    <section lang={lang} aria-labelledby={`ge-${lang}`} style={{ marginBottom: 28 }}>
      <Title id={`ge-${lang}`} style={{ fontSize: 26, margin: "0 0 8px" }}>
        {t(ERRORS.title)}
      </Title>
      <p style={{ margin: 0 }}>{t(ERRORS.appBody)}</p>
      <div style={box}>
        <Sub style={{ fontSize: 20, margin: "0 0 8px", color: "#8f1c13" }}>{t(ERRORS.needHelp)}</Sub>
        <ul style={{ margin: 0, paddingLeft: 20 }}>
          <li>{fill(t(ERRORS.usLine), { line: a("tel:988", "988") })}</li>
          <li>{fill(t(ERRORS.danger), { number: a("tel:911", "911") })}</li>
          <li>{fill(t(ERRORS.otherCountries), { directory: a("https://findahelpline.com", "findahelpline.com", true) })}</li>
        </ul>
      </div>
    </section>
  );
}

export default function GlobalError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          fontSize: 17,
          background: "#f7f5f0",
          color: "#1f2328",
          lineHeight: 1.6,
        }}
      >
        <title>Something went wrong · Clinician Resource Companion</title>
        <main style={{ maxWidth: 640, margin: "0 auto", padding: "32px 16px" }}>
          <Section lang="en" />
          <Section lang="es" />
          <button
            type="button"
            onClick={() => retry()}
            style={{
              minHeight: 44,
              padding: "0 20px",
              borderRadius: 12,
              border: "1px solid #2d5279",
              background: "#2d5279",
              color: "#ffffff",
              fontSize: 16,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {ERRORS.retry.en} · <span lang="es">{ERRORS.retry.es}</span>
          </button>
        </main>
        <footer style={{ borderTop: "1px solid #e2ddd3", padding: 16, textAlign: "center", fontWeight: 600 }}>
          <p style={{ margin: "0 0 4px" }}>{DISCLAIMER.en}</p>
          <p lang="es" style={{ margin: 0 }}>
            {DISCLAIMER.es}
          </p>
        </footer>
      </body>
    </html>
  );
}
