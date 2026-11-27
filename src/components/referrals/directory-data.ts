/**
 * Curated, link-out-only referral directories (content/referrals/us.json + international.json), validated with the
 * content contract and indexed for the directory filter. Import from SERVER components only (the JSON stays out of
 * client bundles); client components receive id lists.
 */
import usJson from "@content/referrals/us.json";
import intlJson from "@content/referrals/international.json";
import {
  REFERRAL_KINDS,
  ReferralDirectorySchema,
  referralsFor,
  type ReferralDirectory,
  type ReferralEntry,
  type ReferralKind,
} from "@/lib/schemas-referrals";
import type { FacetIndex } from "@/components/ethics/facet-index";
import { DIRECTORY_REGIONS, KIND_ORDER } from "./referral-format";

export const usDirectory: ReferralDirectory = ReferralDirectorySchema.parse(usJson);
export const intlDirectory: ReferralDirectory = ReferralDirectorySchema.parse(intlJson);
export const DIRECTORIES: readonly ReferralDirectory[] = [usDirectory, intlDirectory];

/** US entries first, then other countries, then international services. Stable within each. */
function regionRank(e: ReferralEntry): number {
  if (e.region === "US" || e.region.startsWith("US-")) return 0;
  if (e.region === "INTL") return 2;
  return 1;
}

export interface DirectoryGroup {
  kind: ReferralKind;
  entries: ReferralEntry[];
}

/** Entries grouped by kind in KIND_ORDER (crisis first), using referralsFor for each kind. */
export function directoryGroups(dirs: readonly ReferralDirectory[] = DIRECTORIES): DirectoryGroup[] {
  const kinds = [...KIND_ORDER, ...REFERRAL_KINDS.filter((k) => !KIND_ORDER.includes(k))];
  return kinds
    .map((kind) => ({
      kind,
      entries: dirs
        .flatMap((d) => referralsFor(d, { kind }))
        .map((e, i) => ({ e, i }))
        .sort((a, b) => regionRank(a.e) - regionRank(b.e) || a.i - b.i)
        .map(({ e }) => e),
    }))
    .filter((g) => g.entries.length > 0);
}

/** Facet index for the directory filter: kind and region (referralsFor includes INTL services for every region). */
export function directoryIndex(dirs: readonly ReferralDirectory[] = DIRECTORIES): FacetIndex {
  const ids = (opts: { kind?: ReferralKind; region?: string }) => dirs.flatMap((d) => referralsFor(d, opts).map((e) => e.id));
  return {
    directory: {
      kind: Object.fromEntries(REFERRAL_KINDS.map((k) => [k, ids({ kind: k })])),
      region: Object.fromEntries(DIRECTORY_REGIONS.map((r) => [r, ids({ region: r })])),
    },
  };
}
