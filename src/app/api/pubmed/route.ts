// POST /api/pubmed. Thin wrapper: the handler, validation and upstream rules live in src/server/routes/pubmed.ts.
// runtime is declared here (not re-exported) because Next.js reads route segment config statically.
export { POST } from "@/server/routes/pubmed";
export const runtime = "nodejs";
