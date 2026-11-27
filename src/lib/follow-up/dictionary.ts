/**
 * The curated trigger dictionary (content/trigger-objects.json), validated with zod at module load (G10).
 * Static import: safe in the browser; nothing is fetched or stored.
 */
import triggerObjectsJson from "@content/trigger-objects.json";
import { TriggerObjectsFileSchema, type TriggerObjectsFile } from "@/lib/schemas-follow-up";

export const triggerDictionary: TriggerObjectsFile = TriggerObjectsFileSchema.parse(triggerObjectsJson);
