import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookMarked, HeartPulse, LifeBuoy, MapPinned, Pill, Sprout } from "lucide-react";
import { getIntervention } from "@/lib/library";
import { SUD_KINDS, DIRECTORY_REGIONS, KIND_LABELS, regionLabel } from "@/components/referrals/referral-format";
import { Card } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { PageIntro, ReviewBadge, SourcesList } from "@/components/content/content-bits";
import { CrisisInline } from "@/components/crisis/crisis-panel";
import { HubPrompt } from "@/components/hub/hub-prompt";
import { FacetCount, FacetEmpty, FacetGate, FacetReset, FacetSelect } from "@/components/ethics/facet-filter";
import { ALL, type FacetOption } from "@/components/ethics/facet-index";
import { DIRECTORIES, directoryGroups, directoryIndex } from "@/components/referrals/directory-data";
import { DirectoryEntryCard } from "@/components/referrals/directory-entry";
import { DirectoryFilterProvider } from "@/components/referrals/directory-filter";
import { ReferralSearch } from "@/components/referrals/referral-search";
import { ReferralSearchProvider, SearchPresetButton } from "@/components/referrals/search-context";
import { COMPLEMENTARY_IDS, ComplementaryOptions } from "@/components/referrals/complementary-options";

export const metadata: Metadata = { title: "Referrals" };

/**
 * Screen 7: Referrals (docs/SPEC.md sections 3, 9, 11.1; guardrails G4, G5, G6, G8, G9, G17).
 * Crisis support first; then the live location search (our /api routes only), medication-evaluation routes,
 * complementary and integrative options, and the curated link-out directories.
 */
export default function ReferralsPage() {
  const groups = directoryGroups();
  const index = directoryIndex();
  const items = { directory: groups.flatMap((g) => g.entries.map((e) => e.id)) };
  const complementary = COMPLEMENTARY_IDS.flatMap((id) => {
    const intervention = getIntervention(id);
    return intervention ? [{ id, intervention }] : [];
  });
  const kindOptions: FacetOption[] = [
    { value: ALL, label: "All types of help" },
    ...groups.map((g) => ({ value: g.kind, label: KIND_LABELS[g.kind] })),
  ];
  const regionOptions: FacetOption[] = [
    { value: ALL, label: "All regions" },
    ...DIRECTORY_REGIONS.map((r) => ({ value: r, label: r === "INTL" ? "International services only" : regionLabel(r) })),
  ];
  const sudPrompt = <HubPrompt context="sud" />;

  return (
    <>
      <PageIntro title="Referrals" eyebrow="Step 7 · Find care beyond counseling">
        <p>
          Psychiatry and medication evaluation, substance use treatment, low-cost care, peer support and crisis lines.
          Locations are typed on this device and sent only as a ZIP code or a city and state.
        </p>
      </PageIntro>

      {/* Compact crisis strip (the full panel is one tap away under Crisis help, on every screen). */}
      <section
        aria-labelledby="crisis-heading"
        className="mb-6 rounded-xl border border-border border-l-[6px] border-l-crisis bg-surface p-4"
      >
        <h2 id="crisis-heading" className="flex items-center gap-2 text-base font-bold">
          <LifeBuoy aria-hidden className="size-5 text-crisis" />
          Crisis and emergency support
        </h2>
        <CrisisInline className="mt-1" />
        <p className="text-xs text-muted">
          Numbers for other countries are under the Crisis help button. This app never assesses or decides risk; follow
          your crisis protocol and clinical judgment.
        </p>
      </section>

      <nav aria-label="On this page" className="mb-8">
        <ul className="flex flex-wrap gap-2">
          {[
            { href: "#find-care", label: "Find care" },
            { href: "#medication-evaluation", label: "Medication evaluation" },
            { href: "#complementary", label: "Complementary options" },
            { href: "#directory", label: "Directories" },
          ].map((l) => (
            <li key={l.href}>
              <a
                href={l.href}
                className="inline-flex min-h-11 items-center rounded-full border border-border bg-surface px-4 text-sm font-semibold text-text hover:border-accent hover:bg-surface-2"
              >
                {l.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <ReferralSearchProvider>
        <section id="find-care" aria-labelledby="find-care-heading" className="mb-8 scroll-mt-6">
          <Card className="space-y-4 sm:p-6">
            <div>
              <h2 id="find-care-heading" className="flex items-center gap-2 text-xl font-bold">
                <MapPinned aria-hidden className="size-5 text-accent" />
                Find care near a location
              </h2>
              <p className="mt-1 text-sm text-muted">
                Licensed providers from the CMS NPI Registry, sliding-fee health centers from HRSA, and mental health and
                substance use treatment facilities from SAMHSA. United States only; for other countries use the
                directories below.
              </p>
            </div>
            <ReferralSearch sudPrompt={sudPrompt} />
          </Card>
        </section>

        <section id="medication-evaluation" aria-labelledby="med-eval-heading" className="mb-8 scroll-mt-6">
          <h2 id="med-eval-heading" className="flex items-center gap-2 text-xl font-bold">
            <Pill aria-hidden className="size-5 text-accent" />
            Medication evaluation
          </h2>
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted">
            Questions about starting, changing or stopping medication belong with a prescriber. This app gives no
            prescribing or dosing advice. Consider a referral to one of these, with the client&apos;s consent:
          </p>
          <ul className="mt-4 grid gap-3 md:grid-cols-3">
            <li>
              <Card className="flex h-full flex-col gap-2">
                <h3 className="font-semibold">Psychiatrist</h3>
                <p className="flex-1 text-sm leading-relaxed text-muted">
                  A physician specializing in mental health. Consider for complex, severe or treatment-resistant
                  presentations, possible bipolar or psychotic disorders, or several medications at once.
                </p>
                <SearchPresetButton preset={{ mode: "providers", providerType: "psychiatrist" }} label="Providers: Psychiatrist (MD/DO)">
                  Search psychiatrists
                </SearchPresetButton>
              </Card>
            </li>
            <li>
              <Card className="flex h-full flex-col gap-2">
                <h3 className="font-semibold">Psychiatric-mental health nurse practitioner</h3>
                <p className="flex-1 text-sm leading-relaxed text-muted">
                  An advanced practice nurse who assesses and prescribes for mental health conditions, within each
                  state&apos;s scope-of-practice rules.
                </p>
                <SearchPresetButton
                  preset={{ mode: "providers", providerType: "psychiatric-np" }}
                  label="Providers: Psychiatric-mental health nurse practitioner"
                >
                  Search psychiatric NPs
                </SearchPresetButton>
              </Card>
            </li>
            <li>
              <Card className="flex h-full flex-col gap-2">
                <h3 className="font-semibold">Primary care clinician</h3>
                <p className="flex-1 text-sm leading-relaxed text-muted">
                  Often the most reachable prescriber for common depression and anxiety, and can check for medical
                  contributors. HRSA health centers offer primary care on a sliding fee scale.
                </p>
                <SearchPresetButton preset={{ mode: "health-centers" }} label="Health centers (sliding-fee primary care)">
                  Search health centers
                </SearchPresetButton>
              </Card>
            </li>
          </ul>
          <ul className="mt-4 flex flex-col gap-1 text-sm sm:flex-row sm:flex-wrap sm:gap-x-6">
            <li>
              <Link href="/medications" className="inline-flex min-h-11 items-center gap-1.5 font-semibold text-accent underline decoration-accent/40 underline-offset-2">
                Medication reference for referral conversations
                <ArrowRight aria-hidden className="size-4" />
              </Link>
            </li>
            <li>
              <Link
                href="/interventions/medication-referral"
                className="inline-flex min-h-11 items-center gap-1.5 font-semibold text-accent underline decoration-accent/40 underline-offset-2"
              >
                How to make a medication referral
                <ArrowRight aria-hidden className="size-4" />
              </Link>
            </li>
            <li>
              <a href="#directory" className="inline-flex min-h-11 items-center gap-1.5 font-semibold text-accent underline decoration-accent/40 underline-offset-2">
                Opioid treatment and buprenorphine directories
                <ArrowRight aria-hidden className="size-4" />
              </a>
            </li>
          </ul>
        </section>
      </ReferralSearchProvider>

      <section id="complementary" aria-labelledby="complementary-heading" className="mb-8 scroll-mt-6">
        <h2 id="complementary-heading" className="flex items-center gap-2 text-xl font-bold">
          <Sprout aria-hidden className="size-5 text-accent" />
          Complementary &amp; integrative options
        </h2>
        <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted">
          Practices with research support that can sit alongside psychotherapy and, where needed, medication. Evidence
          notes come from the National Center for Complementary and Integrative Health (NCCIH) and the cited trials.
          Only evidence-supported options are listed; check NCCIH before endorsing anything else a client asks about.
        </p>
        <div className="mt-4">
          <ComplementaryOptions items={complementary} />
        </div>
      </section>

      <section id="directory" aria-labelledby="directory-heading" className="scroll-mt-6">
        <h2 id="directory-heading" className="flex items-center gap-2 text-xl font-bold">
          <BookMarked aria-hidden className="size-5 text-accent" />
          Directories and helplines
        </h2>
        <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted">
          A curated list that links to each official site; nothing is copied from them. Entries marked Not yet
          re-verified must be confirmed on the official site before you rely on them.
        </p>

        <DirectoryFilterProvider index={index} items={items} regions={DIRECTORY_REGIONS}>
          <Card className="mt-4 space-y-3">
            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end">
              <FacetSelect facet="kind" label="Type of help" options={kindOptions} />
              <FacetSelect
                facet="region"
                label="Country or region"
                hint="International services are included for every country."
                options={regionOptions}
              />
              <FacetReset label="Show all" className="w-full md:w-auto" />
            </div>
            <FacetCount group="directory" singular="entry" plural="entries" />
          </Card>

          <div className="mt-5 space-y-8">
            <FacetEmpty group="directory">
              <Notice tone="neutral" title="Nothing in this list matches both filters">
                <p>Choose All types of help or All regions. For other countries, findahelpline.com lists crisis lines worldwide.</p>
              </Notice>
            </FacetEmpty>
            {groups.map((g) => (
              <FacetGate key={g.kind} as="section" group="directory" ids={g.entries.map((e) => e.id)} className="space-y-3">
                <h3 className="flex items-center gap-2 text-lg font-semibold">
                  {g.kind === "crisis" ? <HeartPulse aria-hidden className="size-5 text-crisis" /> : null}
                  {KIND_LABELS[g.kind]}
                </h3>
                {SUD_KINDS.includes(g.kind) ? sudPrompt : null}
                <ul className="grid gap-3 md:grid-cols-2">
                  {g.entries.map((e) => (
                    <FacetGate key={e.id} as="li" group="directory" id={e.id}>
                      <DirectoryEntryCard entry={e} />
                    </FacetGate>
                  ))}
                </ul>
              </FacetGate>
            ))}
          </div>
        </DirectoryFilterProvider>

        <Card className="mt-8 space-y-4">
          <h3 className="text-base font-semibold">About these directories</h3>
          {DIRECTORIES.map((d) => (
            <div key={d.scope} className="space-y-2">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-semibold">{d.scope === "US" ? "United States list" : "International list"}</span>
                <span className="text-muted">
                  compiled {d.compiledOn}
                  {d.lastVerified ? ` · verified ${d.lastVerified}` : " · see each entry for verification"}
                </span>
                <ReviewBadge reviewedBy={d.reviewedBy} />
              </div>
              <SourcesList sources={d.sources} />
            </div>
          ))}
          <p className="text-xs text-muted">License: original descriptions (app-authored); services are linked, never re-hosted.</p>
        </Card>
      </section>
    </>
  );
}
