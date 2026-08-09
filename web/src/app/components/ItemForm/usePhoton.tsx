'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  coordsFromFeature,
  photonLang,
  photonSearchUrl,
} from '../../data/photon';
import type { PhotonFeature, PlaceChoice } from './types';

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
  // Normalize each side of the separator independently -- trimming only
  // the fully-joined string would leave whitespace trailing off `city`
  // sitting in the middle of the key (right before `|||`), so two
  // entries differing only in incidental whitespace wouldn't dedupe.
  const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
  const key = `${normalize(city)}|||${normalize(line2)}`;
  return { city, line2, key };
}

// De-duplicates Photon results first by OSM id, then by their rendered
// display (some places share an OSM id-distinct entry but format
// identically, e.g. differently-tagged nodes for the same city).
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

// Below 3 chars there's nothing worth querying Photon for -- same
// threshold the PostgREST search filter uses, for the same trigram-index
// reasoning.
export function isQueryLongEnough(query: string): boolean {
  return query.trim().length >= 3;
}

/* v8 ignore start -- hook internals (fetch, timers, DOM); the extracted
 * pure helpers above are what's gated and mutation-tested. */
// Stryker disable all: hook internals aren't covered by tests, only the
// extracted pure helpers above are -- mutants in here would only be noise.
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
      // Abort any in-flight geocode too -- otherwise it resolves later and,
      // if the field is re-focused with a long-enough query before then,
      // briefly renders results for a query the user already cleared.
      abortRef.current?.abort();
      setResults([]);
      setActiveIdx(-1);
      setError(false);
      setLoading(false);
      return;
    }
    const q = query.trim();
    const timer = setTimeout(async () => {
      abortRef.current?.abort();
      const ctl = new AbortController();
      abortRef.current = ctl;
      // Guards below check `abortRef.current === ctl` rather than relying
      // solely on AbortError: the abort() call above happens synchronously,
      // but the aborted request's own rejection is delivered on a later
      // microtask/turn -- often *after* this request has already reached
      // `setLoading(true)`. Without the guard, the older request's
      // `finally` still runs and clears `loading` out from under this one.
      try {
        setLoading(true);
        setError(false);
        const url = photonSearchUrl(q, { limit: 5, lang });
        const res = await fetch(url, { signal: ctl.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: { features: PhotonFeature[] } = await res.json();
        if (abortRef.current !== ctl) return;

        setResults(dedupePhotonFeatures(data.features, regionNames));
        setActiveIdx(-1);
      } catch (err) {
        // A newer keystroke aborting this request isn't a failure -- the
        // request that superseded it owns the resulting state.
        if (err instanceof DOMException && err.name === 'AbortError') return;
        if (abortRef.current !== ctl) return;
        setResults([]);
        setActiveIdx(-1);
        setError(true);
      } finally {
        if (abortRef.current === ctl) setLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
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
      // The coordinates ride along with the label: this is the one moment
      // the app knows where the place the user picked actually is, and
      // dropping them here is what forced the map to ask Photon all over
      // again later.
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
        // Dismisses the suggestion menu only -- without stopping the
        // keystroke here, it bubbles past React's root to the modal's own
        // `window`-level Escape listener and closes the whole form.
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
