'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PhotonFeature } from './types';

type RegionNames = Intl.DisplayNames | null;

function resolveLang(explicit?: string): string {
  if (explicit && typeof explicit === 'string') return explicit;
  if (typeof navigator !== 'undefined' && navigator.language)
    return navigator.language;
  return 'en';
}

function pickPhotonLang(resolvedLocale: string): string {
  const parts = resolvedLocale.split('-');
  const region = (parts[1] || '').toUpperCase();
  const germanRegions = new Set(['DE', 'AT', 'CH', 'LI', 'LU']);
  return germanRegions.has(region) ? 'de' : 'en';
}

export function usePhotonSearch(locale?: string) {
  const [query, setQuery] = useState('');
  const [focus, setFocus] = useState(false);
  const [results, setResults] = useState<PhotonFeature[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);

  const abortRef = useRef<AbortController | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const resolvedLocale = useMemo(() => resolveLang(locale), [locale]);
  const photonLang = useMemo(
    () => pickPhotonLang(resolvedLocale),
    [resolvedLocale],
  );

  const DNConstructor = (Intl as { DisplayNames?: typeof Intl.DisplayNames })
    .DisplayNames;
  const regionNames: RegionNames = useMemo(
    () =>
      DNConstructor
        ? new DNConstructor([photonLang], { type: 'region' })
        : null,
    [DNConstructor, photonLang],
  );

  const formatDisplay = useCallback(
    (p: PhotonFeature['properties']) => {
      const city =
        p.city || p.town || p.village || p.municipality || p.name || '';
      const country =
        p.country ||
        (p.countrycode && regionNames
          ? regionNames.of(p.countrycode.toUpperCase())
          : undefined);
      const line2 = [p.state, country].filter(Boolean).join(', ');
      const key = `${city}|||${line2}`
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
      return { city, line2, key };
    },
    [regionNames],
  );

  useEffect(() => {
    if (!focus || query.trim().length < 3) {
      setResults([]);
      setActiveIdx(-1);
      return;
    }
    const q = query.trim();
    const timer = setTimeout(async () => {
      try {
        abortRef.current?.abort();
        const ctl = new AbortController();
        abortRef.current = ctl;
        setLoading(true);
        const url = new URL('https://photon.komoot.io/api/');
        url.searchParams.set('q', q);
        url.searchParams.set('limit', '5');
        url.searchParams.set('lang', photonLang);
        const res = await fetch(url.toString(), { signal: ctl.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: { features: PhotonFeature[] } = await res.json();

        const uniqueByOsm = Array.from(
          new Map(data.features.map((f) => [f.properties.osm_id, f])).values(),
        );
        const seen = new Set<string>();
        const deduped: PhotonFeature[] = [];
        for (const f of uniqueByOsm) {
          const { key } = formatDisplay(f.properties);
          if (seen.has(key)) continue;
          seen.add(key);
          deduped.push(f);
        }
        setResults(deduped);
        setActiveIdx(-1);
      } catch {
        setResults([]);
        setActiveIdx(-1);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query, focus, photonLang, formatDisplay]);

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
    (hit: PhotonFeature) => {
      const { city, line2 } = formatDisplay(hit.properties);
      const countryOnly = line2.split(', ').pop() || '';
      const label = countryOnly ? `${city}, ${countryOnly}` : city;
      setResults([]);
      setActiveIdx(-1);
      setFocus(false);
      return label;
    },
    [formatDisplay],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
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
        setResults([]);
        setActiveIdx(-1);
        setFocus(false);
      }
    },
    [results, activeIdx, choose],
  );

  return {
    // state exposed
    query,
    setQuery,
    focus,
    setFocus,
    results,
    loading,
    activeIdx,
    setActiveIdx,
    // refs
    dropdownRef,
    inputRef,
    menuRef,
    // helpers
    choose,
    onKeyDown,
    formatDisplay,
  };
}
