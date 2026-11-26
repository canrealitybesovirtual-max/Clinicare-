/** CI gate (G7, G10, G13): content must parse and cross-reference cleanly. Exit 1 on any problem. */
import { contentProblems, conditions, handouts, measures, stats, lexicon } from "../src/lib/content";

const problems = contentProblems();
if (problems.length) {
  console.error("Content validation failed:\n- " + problems.join("\n- "));
  process.exit(1);
}
console.log(
  `Content OK: ${lexicon.symptoms.length} symptoms, ${conditions.length} conditions, ${measures.length} measures, ${handouts.length} handouts, ${stats.length} stats.`,
);
