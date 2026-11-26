"use client";
import type { CSSProperties } from "react";

/**
 * Root-level error fallback (G9, G14). Replaces the root layout when the layout itself fails (for
 * example, a content parse error at import). It must work with nothing else loaded, so it imports no
 * content, no session state and no global styles: crisis numbers and the disclaimer are hard-coded and
 * styled inline. It shows no error details and logs nothing (an error could hold session text, G5).
 */

const DISCLAIMER = "Resource only. Not a substitute for clinical judgment. Not a medical device. For licensed clinicians.";

const box: CSSProperties = {
  border: "2px solid #a51d1d",
  borderRadius: 12,
  padding: "16px 20px",
  margin: "24px 0",
  background: "#fff5f5",
  color: "#111827",
};
const link: CSSProperties = { color: "#8a1414", fontWeight: 700 };

export default function GlobalError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          background: "#f8fafc",
          color: "#111827",
          lineHeight: 1.5,
        }}
      >
        <title>Something went wrong · Clinician Resource Companion</title>
        <main style={{ maxWidth: 640, margin: "0 auto", padding: "32px 16px" }}>
          <h1 style={{ fontSize: 26, margin: "0 0 8px" }}>Something went wrong</h1>
          <p style={{ margin: 0 }}>
            The app could not load. No details were recorded or sent. Crisis help is below and does not depend on the app.
          </p>

          <section aria-labelledby="ge-crisis" style={box}>
            <h2 id="ge-crisis" style={{ fontSize: 20, margin: "0 0 8px", color: "#8a1414" }}>
              Need help now?
            </h2>
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              <li>
                In the US: call or text{" "}
                <a href="tel:988" style={link}>
                  988
                </a>{" "}
                (988 Suicide &amp; Crisis Lifeline).
              </li>
              <li>
                In immediate danger: call{" "}
                <a href="tel:911" style={link}>
                  911
                </a>{" "}
                or your local emergency number.
              </li>
              <li>
                Other countries:{" "}
                <a href="https://findahelpline.com" target="_blank" rel="noopener noreferrer" style={link}>
                  findahelpline.com
                </a>
                .
              </li>
            </ul>
          </section>

          <button
            type="button"
            onClick={() => retry()}
            style={{
              minHeight: 44,
              padding: "0 20px",
              borderRadius: 8,
              border: "1px solid #1f3a5f",
              background: "#1f3a5f",
              color: "#ffffff",
              fontSize: 16,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </main>
        <footer style={{ borderTop: "1px solid #cbd5e1", padding: "16px", textAlign: "center", fontWeight: 600 }}>
          {DISCLAIMER}
        </footer>
      </body>
    </html>
  );
}
