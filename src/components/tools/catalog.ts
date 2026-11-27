import { ChartLine, GraduationCap, LifeBuoy, NotebookPen, Send, Timer, type LucideIcon } from "lucide-react";

export interface ToolEntry {
  href: string;
  title: string;
  /** One plain-language line for the tools index. */
  line: string;
  icon: LucideIcon;
}

/** The in-session tools, in the order a session usually uses them. */
export const TOOLS: readonly ToolEntry[] = [
  {
    href: "/tools/session",
    title: "Session flow timer",
    line: "Keep the session on track: a simple agenda with the time left for each step.",
    icon: Timer,
  },
  {
    href: "/tools/trend",
    title: "Measure trend",
    line: "Enter GAD-7 or PHQ-9 totals by session number and see the change over time.",
    icon: ChartLine,
  },
  {
    href: "/tools/safety-plan",
    title: "Safety plan worksheet",
    line: "Make a safety plan with the client in their own words and print it with blank lines for names and numbers.",
    icon: LifeBuoy,
  },
  {
    href: "/tools/note",
    title: "Session note helper",
    line: "Draft a SOAP, DAP, BIRP or GIRP note from this session, then copy it or export it.",
    icon: NotebookPen,
  },
  {
    href: "/tools/referral-letter",
    title: "Referral letter",
    line: "Write a referral letter without identifiers from a short list of reasons, ready to print.",
    icon: Send,
  },
  {
    href: "/tools/practice",
    title: "Practice cases",
    line: "Fictional cases that show how possible considerations change as you learn more.",
    icon: GraduationCap,
  },
];
