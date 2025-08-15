'use client';
import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import ReactDOM from 'react-dom';
import { supabase } from '../lib/supabase';
import { useI18n } from '../hooks/useI18n';
import { Button } from './Button';

type PropsCreate = {
  categoryId: string;
  onCreated: () => void;
};

type PhotonFeature = {
  properties: {
    osm_id: number;
    osm_type: string;
    osm_key: string;
    osm_value: string;
    name?: string;
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
    county?: string;
    state?: string;
    country?: string;
    countrycode?: string;
    postcode?: string;
  };
  geometry: {
    type: 'Point';
    coordinates: [number, number];
  };
};

type DisplayParts = {
  city: string;
  line2: string;
  key: string;
};

export default function ItemCreate({ categoryId, onCreated }: PropsCreate) {
  const { t, locale } = useI18n() as unknown as { t: (k: string) => string; locale?: string };

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  const [place, setPlace] = useState('');
  const [placeFocus, setPlaceFocus] = useState(false);
  const [placeResults, setPlaceResults] = useState<PhotonFeature[]>([]);
  const [placeLoading, setPlaceLoading] = useState(false);
  const [placeIdx, setPlaceIdx] = useState(-1);
  const abortRef = useRef<AbortController | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');

  const [isCreating, setIsCreating] = useState(false);

  const resolvedLocale = useMemo(() => {
    if (locale && typeof locale === 'string') return locale;
    if (typeof navigator !== 'undefined' && navigator.language) return navigator.language;
    return 'en';
  }, [locale]);

  const photonLang = useMemo(() => {
    const parts = resolvedLocale.split('-');
    const region = (parts[1] || '').toUpperCase();
    const germanRegions = new Set(['DE', 'AT', 'CH', 'LI', 'LU']);
    return germanRegions.has(region) ? 'de' : 'en';
  }, [resolvedLocale]);

  const regionNames = useMemo(() => {
    const DN = (Intl as any).DisplayNames;
    return DN ? (new DN([photonLang], { type: 'region' }) as Intl.DisplayNames) : null;
  }, [photonLang]);

  const formatDisplay = useCallback(
    (p: PhotonFeature['properties']): DisplayParts => {
      const city = p.city || p.town || p.village || p.municipality || p.name || '';
      const country =
        p.country ||
        (p.countrycode && regionNames ? (regionNames as any).of(p.countrycode.toUpperCase()) : undefined);
      const line2 = [p.state, country].filter(Boolean).join(', ');
      const key = `${city}|||${line2}`.toLowerCase().replace(/\s+/g, ' ').trim();
      return { city, line2, key };
    },
    [regionNames],
  );

  const addTag = () => {
    const v = tagInput.trim();
    if (!v || tags.includes(v)) return;
    setTags((prev) => [...prev, v]);
    setTagInput('');
  };

  const removeTag = (v: string) => setTags((prev) => prev.filter((x) => x !== v));

  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag();
    } else if (e.key === 'Backspace' && !tagInput && tags.length > 0) {
      removeTag(tags[tags.length - 1]);
    }
  };

  useEffect(() => {
    if (!placeFocus || place.trim().length < 3) {
      setPlaceResults([]);
      setPlaceIdx(-1);
      return;
    }
    const q = place.trim();
    const timer = setTimeout(async () => {
      try {
        abortRef.current?.abort();
        const ctl = new AbortController();
        abortRef.current = ctl;
        setPlaceLoading(true);
        const url = new URL('https://photon.komoot.io/api/');
        url.searchParams.set('q', q);
        url.searchParams.set('limit', '5');
        url.searchParams.set('lang', photonLang);
        const res = await fetch(url.toString(), { signal: ctl.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: { features: PhotonFeature[] } = await res.json();
        const uniqueByOsm = Array.from(new Map(data.features.map((f) => [f.properties.osm_id, f])).values());
        const seen = new Set<string>();
        const deduped: PhotonFeature[] = [];
        for (const f of uniqueByOsm) {
          const { key } = formatDisplay(f.properties);
          if (seen.has(key)) continue;
          seen.add(key);
          deduped.push(f);
        }
        setPlaceResults(deduped);
        setPlaceIdx(-1);
      } catch {
        setPlaceResults([]);
        setPlaceIdx(-1);
      } finally {
        setPlaceLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [place, placeFocus, photonLang, formatDisplay]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node;
      const insideInput = inputRef.current?.contains(target);
      const insideAnchor = dropdownRef.current?.contains(target);
      const insideMenu = menuRef.current?.contains(target);
      if (!insideInput && !insideAnchor && !insideMenu) {
        setPlaceFocus(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const choosePlace = (hit: PhotonFeature) => {
    const { city, line2 } = formatDisplay(hit.properties);
    const countryOnly = line2.split(', ').pop() || '';
    const label = countryOnly ? `${city}, ${countryOnly}` : city;
    setPlace(label);
    setPlaceResults([]);
    setPlaceIdx(-1);
    setPlaceFocus(false);
  };

  const onPlaceKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!placeResults.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setPlaceIdx((i) => (i + 1) % placeResults.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setPlaceIdx((i) => (i <= 0 ? placeResults.length - 1 : i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const sel = placeIdx >= 0 ? placeResults[placeIdx] : placeResults[0];
      if (sel) choosePlace(sel);
    } else if (e.key === 'Escape') {
      setPlaceResults([]);
      setPlaceIdx(-1);
      setPlaceFocus(false);
    }
  };

  const createItem = useCallback(async () => {
    const name = title.trim();
    if (!name || isCreating) return;
    setIsCreating(true);
    try {
      const { data, error } = await supabase
        .from('items')
        .insert({
          title: name,
          description: description.trim() || null,
          place: place.trim() || null,
          tags,
        })
        .select('id')
        .single<{ id: string }>();
      if (error || !data) return;
      const { error: linkError } = await supabase
        .from('item_categories')
        .insert({ item_id: data.id, category_id: categoryId });
      if (linkError) return;
      setTitle('');
      setDescription('');
      setPlace('');
      setTags([]);
      setTagInput('');
      onCreated();
    } finally {
      setIsCreating(false);
    }
  }, [title, description, place, tags, categoryId, isCreating, onCreated]);

  const canSubmit = useMemo(() => !!title.trim(), [title]);

  return (
    <section className="p-4 sm:p-5 space-y-3 z-70 relative">

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <input
          aria-label={t('item_create.title')}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && createItem()}
          placeholder={t('item_create.title')}
          className="rounded-xl border px-3 py-2 bg-card/60 dark:bg-card/70 outline-none focus:border-primary dark:focus:border-primary"
        />
        <input
          aria-label={t('item_create.description')}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && createItem()}
          placeholder={t('item_create.description')}
          className="rounded-xl border px-3 py-2 bg-card/60 dark:bg-card/70 outline-none focus:border-primary dark:focus:border-primary"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div className="relative" ref={dropdownRef}>
          <input
            ref={inputRef}
            aria-label={t('item_create.place_placeholder')}
            value={place}
            onChange={(e) => {
              const val = e.target.value;
              setPlace(val);
              if (val.trim() === '') {
                setPlaceResults([]);
                setPlaceIdx(-1);
                setPlaceFocus(true);
              }
            }}
            onFocus={() => setPlaceFocus(true)}
            onKeyDown={onPlaceKeyDown}
            placeholder={t('item_create.place_placeholder')}
            className="w-full rounded-xl border px-3 py-2 bg-card/60 dark:bg-card/70 outline-none focus:border-primary dark:focus:border-primary"
            autoComplete="off"
          />
          {placeFocus && (placeLoading || placeResults.length > 0) &&
            ReactDOM.createPortal(
              (() => {
                const r = inputRef.current?.getBoundingClientRect();
                if (!r) return null;
                return (
                  <div
                    ref={menuRef}
                    className="fixed rounded-xl border bg-card dark:bg-card shadow-lg overflow-hidden z-[2000]"
                    style={{
                      top: r.bottom,
                      left: r.left,
                      width: r.width,
                    }}
                  >
                    {placeLoading && (
                      <div className="px-3 py-2 text-sm text-muted-foreground">
                        {t('item_create.searching')}
                      </div>
                    )}
                    {!placeLoading && placeResults.map((hit, i) => {
                      const p = hit.properties;
                      const city = p.city || p.town || p.village || p.municipality || p.name;
                      const line2 = [p.state, p.country].filter(Boolean).join(', ');
                      return (
                        <Button
                          key={p.osm_id}
                          variant="neutral"
                          type="button"
                          onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                          onClick={() => choosePlace(hit)}
                          className={`w-full text-left justify-start px-3 py-2 text-sm ${
                            i === placeIdx ? 'bg-primary/10 dark:bg-primary/10' : ''
                          }`}
                        >
                          <div className="font-medium">{city}</div>
                          <div className="opacity-70">{line2}</div>
                        </Button>
                      );
                    })}
                    {!placeLoading && placeResults.length === 0 && (
                      <div className="px-3 py-2 text-sm text-muted-foreground">
                        {t('item_create.no_results')}
                      </div>
                    )}
                  </div>
                );
              })(),
              document.body
            )}
        </div>

        <div className="rounded-xl border bg-card/60 dark:bg-card/70 px-2 py-1 flex flex-wrap items-center gap-1 focus-within:border-primary dark:focus-within:border-primary">
          {tags.map((tag) => (
            <span
              key={tag}
              className="flex items-center gap-1 bg-primary/10 dark:bg-primary/20 text-primary rounded-full px-2 py-0.5 text-sm"
            >
              {tag}
              <Button
                type="button"
                variant="destructive"
                size="icon"
                onClick={() => removeTag(tag)}
                className="w-4 h-4"
                title={t('item_create.remove_tag').replace('{tag}', tag)}
              >
                <svg
                  viewBox="0 0 24 24"
                  className="w-3 h-3"
                  stroke="currentColor"
                  strokeWidth="3"
                  fill="none"
                >
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </Button>
            </span>
          ))}
          <input
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={handleTagKeyDown}
            placeholder={tags.length === 0 ? t('item_create.tags_placeholder') : ''}
            className="flex-1 min-w-[100px] bg-transparent outline-none py-1 text-sm"
          />
        </div>
      </div>

      <div className="flex justify-end">
        <Button
          onClick={createItem}
          disabled={isCreating || !canSubmit}
          size="icon"
          title={t('item_create.add')}
        >
          {isCreating ? (
            <div className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
          ) : (
            <svg
              viewBox="0 0 24 24"
              className="w-6 h-6"
              aria-hidden="true"
              stroke="currentColor"
              strokeWidth="2"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          )}
        </Button>
      </div>
    </section>
  );
}
