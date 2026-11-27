/**
 * Clinician screens are written in English only. The language switch changes the shell (header, footer, crisis
 * help) and sets <html lang="es">, so the screen content is marked as English here (WCAG 3.1.2). Parts that are
 * translated, such as a Spanish handout preview, set their own lang.
 */
export default function ClinicianLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <div lang="en">{children}</div>;
}
