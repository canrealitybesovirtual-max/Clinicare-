"use client";
/**
 * Shared, memory-only settings for the referral location search, so buttons elsewhere on the page (for example
 * "Medication evaluation") can preset the search to a curated provider type and move focus to the location field.
 * Only curated option ids live here; never a location or anything typed.
 */
import * as React from "react";
import { ArrowDownToLine } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import type { FacilityTypeId, ProviderTypeId, RadiusOption, SearchMode } from "./search-options";

export interface SearchSettings {
  mode: SearchMode;
  providerType: ProviderTypeId;
  facilityType: FacilityTypeId;
  healthCenterRadius: RadiusOption;
  facilityRadius: RadiusOption;
}

const DEFAULTS: SearchSettings = {
  mode: "providers",
  providerType: "psychiatrist",
  facilityType: "mental-health",
  healthCenterRadius: 10,
  facilityRadius: 25,
};

interface SearchCtx extends SearchSettings {
  update: (patch: Partial<SearchSettings>) => void;
  applyPreset: (patch: Partial<SearchSettings>, label: string) => void;
  presetNotice: string | null;
  clearPresetNotice: () => void;
  /** The search form registers how to focus its location field. */
  focusLocation: React.RefObject<(() => void) | null>;
}

const Ctx = React.createContext<SearchCtx | null>(null);

export function useSearchSettings(): SearchCtx {
  const ctx = React.useContext(Ctx);
  if (!ctx) throw new Error("useSearchSettings must be used inside <ReferralSearchProvider>");
  return ctx;
}

export function ReferralSearchProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = React.useState<SearchSettings>(DEFAULTS);
  const [presetNotice, setPresetNotice] = React.useState<string | null>(null);
  const focusLocation = React.useRef<(() => void) | null>(null);

  const ctx = React.useMemo<SearchCtx>(
    () => ({
      ...settings,
      update: (patch) => {
        setSettings((s) => ({ ...s, ...patch }));
        setPresetNotice(null);
      },
      applyPreset: (patch, label) => {
        setSettings((s) => ({ ...s, ...patch }));
        setPresetNotice(`Search set to ${label}. Enter a ZIP code or a city and state, then choose Search.`);
        // Wait for the form to re-render with the preset before moving focus.
        requestAnimationFrame(() => focusLocation.current?.());
      },
      presetNotice,
      clearPresetNotice: () => setPresetNotice(null),
      focusLocation,
    }),
    [presetNotice, settings],
  );
  return <Ctx.Provider value={ctx}>{children}</Ctx.Provider>;
}

/** Button that presets the location search (curated values only) and moves focus to it. */
export function SearchPresetButton({
  preset,
  label,
  children,
  variant = "outline",
  className,
}: {
  preset: Partial<SearchSettings>;
  /** Spoken in the status message, e.g. "Providers: Psychiatrist (MD/DO)". */
  label: string;
  children: React.ReactNode;
  variant?: ButtonProps["variant"];
  className?: string;
}) {
  const { applyPreset } = useSearchSettings();
  return (
    <Button type="button" variant={variant} className={className} onClick={() => applyPreset(preset, label)}>
      <ArrowDownToLine aria-hidden />
      {children}
    </Button>
  );
}
