import {
  ArrowRightLeft,
  Briefcase,
  ChartLine,
  Columns3,
  FileLock2,
  GitCompareArrows,
  GraduationCap,
  LifeBuoy,
  Network,
  NotebookPen,
  Send,
  ShieldAlert,
  Target,
  Timer,
  type LucideIcon,
} from "lucide-react";

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
  {
    href: "/formulations/builder",
    title: "Formulation worksheet",
    line: "Build a shared formulation (5 Ps, CBT, functional analysis, ACT or relationship pattern) and print a copy safe to share.",
    icon: Network,
  },
  {
    href: "/tools/goals",
    title: "Goal writer",
    line: "Write goals in the style of your approach, check the SMART parts, and scale up to three goals.",
    icon: Target,
  },
  {
    href: "/tools/option-grid",
    title: "Option grid",
    line: "Compare treatment options side by side for a shared decision, with a plain-language client view.",
    icon: Columns3,
  },
  {
    href: "/tools/precautions",
    title: "Intervention precautions",
    line: "Tick health and life context (pregnancy, history of mania, seizures and more) and see sourced cautions to weigh.",
    icon: ShieldAlert,
  },
  {
    href: "/tools/care-transition",
    title: "Care transition checklist",
    line: "Steps for discharge or referral, plus a caring-contacts plan, printed with blank lines.",
    icon: ArrowRightLeft,
  },
  {
    href: "/tools/release-of-information",
    title: "Release of information",
    line: "Build a plain-language authorization with the HIPAA and 42 CFR Part 2 elements and blank lines for identifiers.",
    icon: FileLock2,
  },
  {
    href: "/tools/accommodation-letter",
    title: "Accommodation letter",
    line: "A treating clinician's letter for work or study: what is harder and what would help, no diagnosis.",
    icon: Briefcase,
  },
  {
    href: "/diagnoses/compare",
    title: "Compare considerations",
    line: "Two or three possible considerations from this session side by side, with questions that tell them apart.",
    icon: GitCompareArrows,
  },
];
