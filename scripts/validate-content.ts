/**
 * CI gate (G7, G10, G13). Exit 1 on any problem.
 *  1. Phase 1 content parses and cross-references cleanly (src/lib/content.ts contentProblems()).
 *  2. EVERY file under content/ matches a registered schema with governance (scripts/content-audit.ts).
 * `--release` also fails while any crisis line is unverified (a person must check each official site).
 */
import path from "node:path";
import { contentProblems, conditions, handouts, measures, stats, lexicon } from "../src/lib/content";
import { auditContent } from "./content-audit";

const release = process.argv.includes("--release");
const audit = auditContent(path.resolve(__dirname, "../content"), { release });
const problems = [...contentProblems(), ...audit.problems];

for (const w of audit.warnings) console.warn(`warning: ${w}`);
if (problems.length) {
  console.error("Content validation failed:\n- " + problems.join("\n- "));
  process.exit(1);
}
const byKind = (k: string) => audit.files.filter((f) => f.kind === k).length;
console.log(
  `Content OK: ${audit.files.length} files (${byKind("clinical")} clinical, ${byKind("data")} data, ${byKind("registry")} registries). ` +
    `Phase 1: ${lexicon.symptoms.length} symptoms, ${conditions.length} conditions, ${measures.length} measures, ${handouts.length} handouts, ${stats.length} stats.`,
);
