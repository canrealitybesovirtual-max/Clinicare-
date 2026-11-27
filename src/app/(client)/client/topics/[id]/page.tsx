import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { handoutsById } from "@/components/handouts/catalog";
import { handoutTitle } from "@/components/handouts/localize";
import { ClientTopicView } from "@/components/client/client-topic-view";
import { CLIENT_TOPICS, getClientTopic } from "@/components/client/topics";

/*
 * Client mode topic page (G3): plain topic label, the topic's skills (content/topics.json handoutIds), MedlinePlus
 * pages filtered for client-safe wording, and crisis help on every topic (first on crisis topics). English/Spanish.
 */
export const dynamicParams = false;

export function generateStaticParams() {
  return CLIENT_TOPICS.map((t) => ({ id: t.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return { title: getClientTopic(id)?.label.en ?? "Topic" };
}

export default async function ClientTopicPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const topic = getClientTopic(id);
  if (!topic) notFound();
  const skills = handoutsById(topic.handoutIds).map((h) => ({ id: h.id, title: handoutTitle(h), minutes: h.estimatedMinutes }));
  return <ClientTopicView topic={topic} skills={skills} />;
}
