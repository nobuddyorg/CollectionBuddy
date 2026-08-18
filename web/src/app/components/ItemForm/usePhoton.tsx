'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { searchMinLength } from '../../data/items';
import {
  coordsFromFeature,
  photonLang,
  photonSearchUrl,
} from '../../data/photon';
import type { PhotonFeature, PlaceChoice } from './types';

// Not built on the shared useDebouncedValue hook (ItemList's search box
// uses it): that hook debounces a *value*, but refocusing this field must
// also restart the wait even when the query itself hasn't changed, which
// only a debounce keyed on this effect's own deps (including `focus`) can
// give without an extra render's lag.
const SEARCH_DEBOUNCE_MS = 300;

type RegionNames = Intl.DisplayNames | null;

export function formatPlaceDisplay(
  p: PhotonFeature['properties'],
  regionNames: RegionNames,
): { city: string; line2: string; key: string } {
  const city = p.city || p.town || p.village || p.municipality || p.name || '';
  const country =
    p.country ||
    (p.countrycode && regionNames
      ? regionNames.of(p.countrycode.toUpperCase())
      : undefined);
  const line2 = [p.state, country].filter(Boolean).join(', ');
  // Normalize each side of the separator independently, or whitespace
  // trailing off `city` sits mid-key and two entries differing only in
  // incidental whitespace won't dedupe.
  const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
  const key = `${normalize(city)}|||${normalize(line2)}`;
  return { city, line2, key };
}

// Dedupes first by OSM id, then by rendered display: some places have an
// OSM id-distinct entry that formats identically (e.g. differently-tagged
// nodes for the same city).
export function dedupePhotonFeatures(
  features: PhotonFeature[],
  regionNames: RegionNames,
): PhotonFeature[] {
  const uniqueByOsm = Array.from(
    new Map(features.map((f) => [f.properties.osm_id, f])).values(),
  );
  const seen = new Set<string>();
  const deduped: PhotonFeature[] = [];
  for (const f of uniqueByOsm) {
    const { key } = formatPlaceDisplay(f.properties, regionNames);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(f);
  }
  return deduped;
}

// Must match the threshold the PostgREST search filter uses (`data/items.ts`),
// including the lower floor for non-ASCII queries.
export function isQueryLongEnough(query: string): boolean {
  const trimmed = query.trim();
  return trimmed.length >= searchMinLength(trimmed);
}

/* v8 ignore start -- hook internals (fetch, timers, DOM); the extracted
 * pure helpers above are what's gated and mutation-tested. */
// Stryker disable all
export function usePhotonSearch(locale?: string) {
  const [query, setQuery] = useState('');
  const [focus, setFocus] = useState(false);
  const [results, setResults] = useState<PhotonFeature[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);

  const abortRef = useRef<AbortController | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const lang = useMemo(() => photonLang(locale), [locale]);

  const DNConstructor = (Intl as { DisplayNames?: typeof Intl.DisplayNames })
    .DisplayNames;
  const regionNames: RegionNames = useMemo(
    () =>
      DNConstructor ? new DNConstructor([lang], { type: 'region' }) : null,
    [DNConstructor, lang],
  );

  const formatDisplay = useCallback(
    (p: PhotonFeature['properties']) => formatPlaceDisplay(p, regionNames),
    [regionNames],
  );

  useEffect(() => {
    if (!focus || !isQueryLongEnough(query)) {
      // Abort any in-flight geocode, or it could resolve after a re-focus
      // and briefly render results for a query the user already cleared.
      abortRef.current?.abort();
      setResults([]);
      setActiveIdx(-1);
      setError(false);
      setLoading(false);
      return;
    }
    const q = query.trim();
    const timer = setTimeout(() => {
      void (async () => {
        abortRef.current?.abort();
        const ctl = new AbortController();
        abortRef.current = ctl;
        // Guards below check `abortRef.current === ctl` rather than relying
        // solely on AbortError: the aborted request's rejection can land on
        // a later turn, after this request has already set `loading` true,
        // and its `finally` would otherwise clear `loading` out from under it.
        try {
          setLoading(true);
          setError(false);
          const url = photonSearchUrl(q, { limit: 5, lang });
          const res = await fetch(url, { signal: ctl.signal });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = (await res.json()) as { features: PhotonFeature[] };
          if (abortRef.current !== ctl) return;

          setResults(dedupePhotonFeatures(data.features, regionNames));
          setActiveIdx(-1);
        } catch (err) {
          // A newer keystroke aborting this request isn't a failure; the
          // request that superseded it owns the resulting state.
          if (err instanceof DOMException && err.name === 'AbortError') return;
          if (abortRef.current !== ctl) return;
          setResults([]);
          setActiveIdx(-1);
          setError(true);
        } finally {
          if (abortRef.current === ctl) setLoading(false);
        }
      })();
    }, SEARCH_DEBOUNCE_MS);
    // Cancels the in-flight request too, or closing the form (or the next
    // keystroke) leaves a request on the wire against a rate-limited free
    // service for no reader left to use its result.
    return () => {
      clearTimeout(timer);
      abortRef.current?.abort();
    };
  }, [query, focus, lang, regionNames]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node;
      const insideInput = inputRef.current?.contains(target);
      const insideAnchor = dropdownRef.current?.contains(target);
      const insideMenu = menuRef.current?.contains(target);
      if (!insideInput && !insideAnchor && !insideMenu) setFocus(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const choose = useCallback(
    (hit: PhotonFeature): PlaceChoice => {
      const { city, line2 } = formatDisplay(hit.properties);
      const countryOnly = line2.split(', ').pop() || '';
      const label = countryOnly ? `${city}, ${countryOnly}` : city;
      setResults([]);
      setActiveIdx(-1);
      setFocus(false);
      // This is the one moment the app knows where the picked place is;
      // dropping the coords here would force the map to re-geocode later.
      return { label, coords: coordsFromFeature(hit) };
    },
    [formatDisplay],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>): PlaceChoice | undefined => {
      if (!results.length) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIdx((i) => (i + 1) % results.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIdx((i) => (i <= 0 ? results.length - 1 : i - 1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const sel = activeIdx >= 0 ? results[activeIdx] : results[0];
        if (sel) return choose(sel);
      } else if (e.key === 'Escape') {
        // Without stopping it here, the keystroke bubbles past React's root
        // to the modal's own window-level Escape listener and closes the
        // whole form.
        e.preventDefault();
        e.stopPropagation();
        setResults([]);
        setActiveIdx(-1);
        setFocus(false);
      }
    },
    [results, activeIdx, choose],
  );

  return {
    query,
    setQuery,
    focus,
    setFocus,
    results,
    loading,
    error,
    activeIdx,
    setActiveIdx,
    dropdownRef,
    inputRef,
    menuRef,
    choose,
    onKeyDown,
    formatDisplay,
  };
}
// Stryker restore all
/* v8 ignore stop */
