"use client";
import * as React from "react";
import { scrubPHI, summarizeFindings } from "@/lib/phi-scrubber";
import type { RemovedSummary } from "@/components/symptoms/use-scrubbed-field";
import { gazetteerCity, loadPlaceIndex, type PlaceIndex } from "./location-check";

/**
 * The referral City field (G5). Like useScrubbedField, the raw value lives only in this component's state and is
 * scrubbed before it is used, but with one exception: a value that is exactly a city name in the bundled gazetteer
 * (Austin, Charlotte, Madison, Jackson) is kept instead of being replaced by [NAME]. Anything else the scrubber
 * flags, including a city plus other text ("Austin Smith"), is replaced as usual.
 *
 * Scrubbing runs on blur and on submit, not while typing: a city is short, nothing leaves the device before the
 * submit check, and a notice that appeared mid-typing could move the Search button under the pointer.
 */
export function useCityField() {
  const [draft, setDraftState] = React.useState("");
  const [removed, setRemoved] = React.useState<RemovedSummary | null>(null);
  const draftRef = React.useRef("");
  const placesRef = React.useRef<PlaceIndex | null>(null);
  const ref = React.useRef<HTMLInputElement>(null);

  const setDraft = React.useCallback((value: string) => {
    draftRef.current = value;
    setDraftState(value);
  }, []);

  /**
   * Scrub the current value now. Resolves with the value that is safe to check (clean text, or an exact gazetteer
   * city) and the gazetteer if it was needed. The gazetteer loads only when the scrubber flags the value.
   */
  const settle = React.useCallback(async (): Promise<{ city: string; places: PlaceIndex | null }> => {
    for (;;) {
      const raw = draftRef.current;
      const { clean, findings } = scrubPHI(raw);
      if (findings.length === 0) return { city: raw, places: placesRef.current };
      const places = placesRef.current ?? (await loadPlaceIndex().catch(() => null));
      placesRef.current = places;
      if (draftRef.current !== raw) continue; // typed on while the gazetteer loaded: check the newer value
      if (places && gazetteerCity(raw, places)) {
        setRemoved(null);
        return { city: raw, places };
      }
      setRemoved(summarizeFindings(findings));
      setDraft(clean);
      return { city: clean, places };
    }
  }, [setDraft]);

  return {
    ref,
    draft,
    setDraft,
    settle,
    onBlur: React.useCallback(() => void settle(), [settle]),
    removed,
  };
}
