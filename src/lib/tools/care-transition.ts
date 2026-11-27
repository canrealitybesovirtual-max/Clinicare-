/**
 * Care-transition checklist and caring-contacts plan (tools/care-transition). Pure: no React, no I/O.
 *
 * - A tick-box checklist for a move between services (discharge from hospital, crisis care or an emergency visit,
 *   or a referral), in the app's own words (practice guide care-transitions-and-warm-handoffs).
 * - Caring contacts: the agreed channel and example messages that ask nothing of the client and carry no clinical
 *   detail (practice guide caring-contacts). The app never sends, schedules or stores a message.
 * - No identifiers are typed (G5): dates, names and contacts print as blank lines written by hand. Crisis lines are
 *   always printed (G9). Ticking that Part 2 substance use disorder records are shared adds the Part 2 notice (G6).
 * - It records steps, never a risk level or a decision about the client.
 */
import type { DocBlock, DocSpec } from "./doc-model";

export interface TransitionItem {
  id: string;
  label: string;
  /** Ticking it means Part 2 records are involved (G6). */
  sud?: boolean;
}

export interface TransitionSection {
  id: string;
  heading: string;
  items: readonly TransitionItem[];
  /** Handwritten lines printed under the section. */
  fills?: readonly string[];
}

export const TRANSITION_SECTIONS: readonly TransitionSection[] = [
  {
    id: "before",
    heading: "Before the move",
    items: [
      { id: "contact-team", label: "Spoke with the discharging or referring team, with the client's authorization where needed" },
      { id: "contact-client", label: "Spoke with the client before discharge or before the referral" },
      { id: "first-appointment", label: "First appointment booked within about 7 days, and the client knows when, where and with whom" },
      { id: "access", label: "Travel, cost, child care or the video link checked" },
      { id: "missed-plan", label: "Agreed what happens if the first appointment is missed (same-day outreach)" },
    ],
    fills: ["First appointment (date, time, with whom)"],
  },
  {
    id: "medicines",
    heading: "Medicines",
    items: [
      { id: "med-list", label: "Current medicine list received, including changes made in hospital" },
      { id: "prescriber", label: "Agreed who prescribes from now on, and the next prescriber visit is booked" },
    ],
    fills: ["Next prescriber visit (date)"],
  },
  {
    id: "safety",
    heading: "Safety",
    items: [
      { id: "safety-plan", label: "Safety plan reviewed or made together, in the client's own words" },
      { id: "means", label: "Access to firearms, stored medicines and other means revisited" },
      { id: "crisis", label: "Crisis lines given (printed below)" },
    ],
  },
  {
    id: "supports",
    heading: "Supports",
    items: [
      { id: "supports", label: "Supports the client chose were involved, with consent" },
      { id: "what-to-share", label: "Agreed what supports may be told" },
    ],
  },
  {
    id: "sharing",
    heading: "Sharing information",
    items: [
      { id: "authorization", label: "Authorization on file where one is needed" },
      { id: "summary", label: "Sent only what the receiving clinician needs (minimum necessary)" },
      { id: "part2", label: "Substance use disorder records from a Part 2 program are included, with Part 2 consent", sud: true },
    ],
  },
  {
    id: "loop",
    heading: "Closing the loop",
    items: [
      { id: "attended", label: "Confirmed the first appointment happened" },
      { id: "follow-up", label: "If not, followed up with the client and the receiving service" },
    ],
  },
];

export const TRANSITION_ITEM_IDS: readonly string[] = TRANSITION_SECTIONS.flatMap((s) => s.items.map((i) => i.id));

export const CONTACT_CHANNELS = [
  { value: "phone", label: "Phone call" },
  { value: "text", label: "Text message" },
  { value: "letter", label: "Letter or card" },
  { value: "portal", label: "Patient portal" },
] as const;
export type ContactChannel = (typeof CONTACT_CHANNELS)[number]["value"];

/** Example caring messages: short, warm, no request for a reply and no clinical detail. */
export const CARING_MESSAGES = [
  { id: "thinking", text: "Thinking of you today and hoping things are a little easier. No need to reply." },
  { id: "glad", text: "Just a note to say I am glad we have been working together. I am here when you want to talk." },
  { id: "checking", text: "Checking in to say hello. You do not need to write back." },
  { id: "missed", text: "Sorry we missed each other today. I hope you are okay. Here is how to reach me to set up another time." },
  { id: "season", text: "Wishing you well this week. I am still here if you would like to be in touch." },
] as const;
export type CaringMessageId = (typeof CARING_MESSAGES)[number]["id"];

export interface CareTransitionInput {
  done: readonly string[];
  channel: ContactChannel;
  messageIds: readonly CaringMessageId[];
}

export const CARE_TRANSITION_GOVERNANCE = { license: "original", lastVerified: "2026-11-27", reviewedBy: "PENDING" } as const;

export function careTransitionIncludesPart2(input: Pick<CareTransitionInput, "done">): boolean {
  return TRANSITION_SECTIONS.some((s) => s.items.some((i) => i.sud && input.done.includes(i.id)));
}

const CARE_TRANSITION_TITLE = "Care transition checklist";

export function careTransitionDoc(input: CareTransitionInput): DocSpec {
  const done = new Set(input.done);
  const blocks: DocBlock[] = [
    { kind: "title", text: CARE_TRANSITION_TITLE },
    { kind: "fill", label: "Client" },
    { kind: "fill", label: "Date of the move" },
    {
      kind: "paragraph",
      text: "Checklist of steps for a move between services. It records steps only; it does not assess or decide risk.",
      style: "muted",
    },
  ];
  for (const s of TRANSITION_SECTIONS) {
    blocks.push({ kind: "heading", text: s.heading }, { kind: "list", items: s.items.map((i) => `${done.has(i.id) ? "[x]" : "[  ]"} ${i.label}`) });
    for (const f of s.fills ?? []) blocks.push({ kind: "fill", label: f });
  }
  const channel = CONTACT_CHANNELS.find((c) => c.value === input.channel)?.label ?? "Phone call";
  const messages = CARING_MESSAGES.filter((m) => input.messageIds.includes(m.id)).map((m) => m.text);
  blocks.push(
    { kind: "heading", text: "Caring contacts" },
    { kind: "paragraph", text: `Agreed channel: ${channel}, sent through the service's approved system.` },
    { kind: "fill", label: "Who sends them, and how often" },
  );
  if (messages.length) blocks.push({ kind: "paragraph", text: "Example messages:" }, { kind: "list", items: messages });
  blocks.push(
    {
      kind: "paragraph",
      text: "Messages carry no clinical details. A reply that suggests distress gets a direct conversation and your usual crisis steps.",
      style: "muted",
    },
    { kind: "crisis" },
  );
  return { title: CARE_TRANSITION_TITLE, blocks, part2: careTransitionIncludesPart2(input) };
}
