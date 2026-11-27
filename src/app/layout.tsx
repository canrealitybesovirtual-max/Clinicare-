import type { Metadata, Viewport } from "next";
import "./globals.css";
import { LangProvider } from "@/lib/i18n/core";
import { SessionProvider } from "@/state/session";
import { ServiceWorkerRegister } from "@/components/sw-register";
import { TextSizeProvider } from "@/components/layout/display-controls";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";

export const metadata: Metadata = {
  title: {
    default: "Clinician Resource Companion",
    template: "%s · Clinician Resource Companion",
  },
  description:
    "Reference and resource tool for licensed mental-health clinicians: symptoms to possible diagnoses for clinician review, GAD-7 and PHQ-9, and printable handouts. Resource only. Not a substitute for clinical judgment.",
  applicationName: "Clinician Resource Companion",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icons/icon.svg", apple: "/icons/apple-touch-icon.png" },
  // Phase 1 is not for public discovery.
  robots: { index: false, follow: false },
  referrer: "no-referrer",
  formatDetection: { telephone: false, email: false, address: false },
};

export const viewport: Viewport = {
  // Matches the header surface in each theme (globals.css --surface).
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fffdf9" },
    { media: "(prefers-color-scheme: dark)", color: "#1e1f22" },
  ],
  colorScheme: "light dark",
  width: "device-width",
  initialScale: 1,
};

/**
 * Root shell. Language (EN/ES), large text and the clinical session are all memory-only providers (G5); the
 * header, footer and crisis button wrap every page in every mode.
 */
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="scheme-light-dark">
      <body className="flex min-h-dvh flex-col antialiased">
        <LangProvider>
          <TextSizeProvider>
            <SessionProvider>
              <SiteHeader />
              <main id="main" tabIndex={-1} className="mx-auto w-full max-w-6xl flex-1 px-4 pt-5 outline-none sm:px-6 sm:pt-10">
                {children}
              </main>
              <SiteFooter />
              <ServiceWorkerRegister />
            </SessionProvider>
          </TextSizeProvider>
        </LangProvider>
      </body>
    </html>
  );
}
