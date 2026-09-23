'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { searchMinLength } from '../../data/items';
import {
  coordsFromFeature,
  photonLang,
  photonSearchUrl,
} from '../../data/photon';
import type { PhotonFeature, PlaceChoice } from './types';

// Not the shared useDebouncedValue: refocusing must restart the wait even when the query is unchanged.
const SEARCH_DEBOUNCE_MS = 300;

type RegionNames = Intl.DisplayNames | null;

export function formatPlaceDisplay(
  properties: PhotonFeature['properties'],
  regionNames: RegionNames,
): { city: string; line2: string; key: string } {
  const city =
    properties.city ||
    properties.town ||
    properties.village ||
    properties.municipality ||
    properties.name ||
    '';
  const country =
    properties.country ||
    (properties.countrycode && regionNames
      ? regionNames.of(properties.countrycode.toUpperCase())
      : undefined);
  const line2 = [properties.state, country].filter(Boolean).join(', ');
  // Each side is normalized on its own, or whitespace trailing off `city` sits mid-key and breaks dedupe.
  const normalize = (text: string) =>
    text.toLowerCase().replace(/\s+/g, ' ').trim();
  const key = `${normalize(city)}|||${normalize(line2)}`;
  return { city, line2, key };
}

// First by OSM id, then by rendered display: differently-tagged nodes for one city format identically.
export function dedupePhotonFeatures(
  features: PhotonFeature[],
  regionNames: RegionNames,
): PhotonFeature[] {
  const uniqueByOsm = Array.from(
    new Map(
      features.map((feature) => [feature.properties.osm_id, feature]),
    ).values(),
  );
  const seen = new Set<string>();
  const deduped: PhotonFeature[] = [];
  for (const feature of uniqueByOsm) {
    const { key } = formatPlaceDisplay(feature.properties, regionNames);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(feature);
  }
  return deduped;
}

// Must match the threshold the PostgREST search filter uses, including the lower floor for non-ASCII.
export function isQueryLongEnough(query: string): boolean {
  const trimmed = query.trim();
  return trimmed.length >= searchMinLength(trimmed);
}

export function usePhotonSearch(locale?: string) {
  const [query, setQuery] = useState('');
  const [focus, setFocus] = useState(false);
  const [results, setResults] = useState<PhotonFeature[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  // Tells "nothing searched yet" from "the search came back empty"; only the second shows "no results".
  const [searched, setSearched] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const abortRef = useRef<AbortController | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const lang = useMemo(() => photonLang(locale), [locale]);

  const DisplayNamesConstructor = (
    Intl as { DisplayNames?: typeof Intl.DisplayNames }
  ).DisplayNames;
  const regionNames: RegionNames = useMemo(
    () =>
      DisplayNamesConstructor
        ? new DisplayNamesConstructor([lang], { type: 'region' })
        : null,
    [DisplayNamesConstructor, lang],
  );

  const formatDisplay = useCallback(
    (properties: PhotonFeature['properties']) =>
      formatPlaceDisplay(properties, regionNames),
    [regionNames],
  );

  useEffect(() => {
    if (!focus || !isQueryLongEnough(query)) {
      // An in-flight geocode could otherwise resolve after a re-focus and show results for a cleared query.
      abortRef.current?.abort();
      setResults([]);
      setActiveIndex(-1);
      setError(false);
      setLoading(false);
      setSearched(false);
      return;
    }
    setSearched(false);
    const trimmedQuery = query.trim();
    const timer = setTimeout(() => {
      void (async () => {
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;
        // Guarded on `abortRef.current === controller`: an aborted request's rejection can land a turn late.
        try {
          setLoading(true);
          setError(false);
          const url = photonSearchUrl(trimmedQuery, { limit: 5, lang });
          const response = await fetch(url, { signal: controller.signal });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const data = (await response.json()) as { features: PhotonFeature[] };
          if (abortRef.current !== controller) return;

          setResults(dedupePhotonFeatures(data.features, regionNames));
          setActiveIndex(-1);
        } catch (error) {
          // A newer keystroke aborting this request is not a failure; the newer request owns the state.
          if (error instanceof DOMException && error.name === 'AbortError')
            return;
          if (abortRef.current !== controller) return;
          console.error('Place search failed:', error);
          setResults([]);
          setActiveIndex(-1);
          setError(true);
        } finally {
          if (abortRef.current === controller) {
            setLoading(false);
            setSearched(true);
          }
        }
      })();
    }, SEARCH_DEBOUNCE_MS);
    // Aborts the in-flight request too, or closing the form leaves one on the wire for nobody.
    return () => {
      clearTimeout(timer);
      abortRef.current?.abort();
    };
  }, [query, focus, lang, regionNames]);

  useEffect(() => {
    // Listens only while there is a focus state to lose, so idle clicks pay nothing.
    if (!focus) return;
    const onDocumentClick = (event: MouseEvent) => {
      // The input and the menu both render inside this anchor, whose ref is set while this listener is on.
      if (dropdownRef.current!.contains(event.target as Node)) return;
      setFocus(false);
    };
    document.addEventListener('mousedown', onDocumentClick);
    return () => document.removeEventListener('mousedown', onDocumentClick);
  }, [focus]);

  const choose = useCallback(
    (hit: PhotonFeature): PlaceChoice => {
      const { city, line2 } = formatDisplay(hit.properties);
      const countryOnly = line2.split(', ').pop() || '';
      const label = countryOnly ? `${city}, ${countryOnly}` : city;
      setResults([]);
      setActiveIndex(-1);
      setFocus(false);
      // The one moment the app knows where the picked place is; dropped, the map would re-geocode it.
      return { label, coords: coordsFromFeature(hit) };
    },
    [formatDisplay],
  );

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>): PlaceChoice | undefined => {
      if (!results.length) return;
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setActiveIndex((index) => (index + 1) % results.length);
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActiveIndex((index) =>
          index <= 0 ? results.length - 1 : index - 1,
        );
      } else if (event.key === 'Enter') {
        event.preventDefault();
        // Clamped, not branched: with nothing highlighted Enter picks the first.
        const selected = results[Math.max(activeIndex, 0)];
        if (selected) return choose(selected);
      } else if (event.key === 'Escape') {
        // Left to bubble, the keystroke reaches the modal's Escape listener and closes the whole form.
        event.preventDefault();
        event.stopPropagation();
        // `showMenu` checks `focus` first, so the menu hides at once; the search effect clears the rest.
        setFocus(false);
      }
    },
    [results, activeIndex, choose],
  );

  return {
    query,
    setQuery,
    focus,
    setFocus,
    results,
    loading,
    error,
    searched,
    activeIndex,
    setActiveIndex,
    dropdownRef,
    inputRef,
    menuRef,
    choose,
    onKeyDown,
    formatDisplay,
  };
}
