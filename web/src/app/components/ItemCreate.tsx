'use client';
import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useI18n } from '../hooks/useI18n';

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

export default function ItemCreate({ categoryId, onCreated }: PropsCreate) {
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

  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');

  const [isCreating, setIsCreating] = useState(false);
  const { t } = useI18n();

  const addTag = () => {
    const t = tagInput.trim();
    if (!t || tags.includes(t)) return;
    setTags((prev) => [...prev, t]);
    setTagInput('');
  };
  const removeTag = (t: string) =>
    setTags((prev) => prev.filter((x) => x !== t));

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
        url.searchParams.set('lang', 'de');

        const res = await fetch(url.toString(), {
          signal: ctl.signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data: { features: PhotonFeature[] } = await res.json();

        const uniqueFeatures = Array.from(
          new Map(data.features.map((f) => [f.properties.osm_id, f])).values(),
        );

        setPlaceResults(uniqueFeatures);

        setPlaceIdx(-1);
      } catch {
        setPlaceResults([]);
        setPlaceIdx(-1);
      } finally {
        setPlaceLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [place, placeFocus]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setPlaceFocus(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const choosePlace = (hit: PhotonFeature) => {
    const p = hit.properties;
    const city = p.city || p.town || p.village || p.municipality || p.name;
    const label = p.country ? `${city}, ${p.country}` : city;
    setPlace(label || '');
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
    <section className="rounded-2xl border bg-card/70 dark:bg-card/60 backdrop-blur p-4 sm:p-5 shadow-sm space-y-3 z-70 relative">
      <h2 className="text-base font-semibold mb-1">
        {t('item_create.new_entry')}
      </h2>

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
          {placeFocus && (placeLoading || placeResults.length > 0) && (
            <div className="absolute mt-1 w-full rounded-xl border bg-card dark:bg-card shadow-lg overflow-hidden">
              {placeLoading && (
                <div className="px-3 py-2 text-sm text-muted-foreground">
                  {t('item_create.searching')}
                </div>
              )}
              {!placeLoading &&
                placeResults.map((hit, i) => {
                  const p = hit.properties;
                  const city =
                    p.city || p.town || p.village || p.municipality || p.name;
                  const line2 = [p.state, p.country].filter(Boolean).join(', ');
                  return (
                    <button
                      key={p.osm_id}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => choosePlace(hit)}
                      className={`block w-full text-left px-3 py-2 text-sm hover:bg-primary/10 dark:hover:bg-primary/10 ${
                        i === placeIdx ? 'bg-primary/10 dark:bg-primary/10' : ''
                      }`}
                    >
                      <div className="font-medium">{city}</div>
                      <div className="opacity-70">{line2}</div>
                    </button>
                  );
                })}
              {!placeLoading && placeResults.length === 0 && (
                <div className="px-3 py-2 text-sm text-muted-foreground">
                  {t('item_create.no_results')}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="rounded-xl border bg-card/60 dark:bg-card/70 px-2 py-1 flex flex-wrap items-center gap-1 focus-within:border-primary dark:focus-within:border-primary">
          {tags.map((tag) => (
            <span
              key={tag}
              className="flex items-center gap-1 bg-primary/10 dark:bg-primary/20 text-primary rounded-full px-2 py-0.5 text-sm"
            >
              {tag}
              <button
                type="button"
                onClick={() => removeTag(tag)}
                className="text-muted-foreground hover:text-foreground"
                aria-label={t('item_create.remove_tag').replace('{tag}', tag)}
              >
                ×
              </button>
            </span>
          ))}
          <input
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={handleTagKeyDown}
            placeholder={
              tags.length === 0 ? t('item_create.tags_placeholder') : ''
            }
            className="flex-1 min-w-[100px] bg-transparent outline-none py-1 text-sm"
          />
        </div>
      </div>

      <div className="flex justify-end">
        <button
          onClick={createItem}
          disabled={isCreating || !canSubmit}
          className="rounded-xl px-4 py-2 bg-primary text-primary-foreground hover:brightness-110 active:scale-[0.99] disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {isCreating ? (
            t('item_create.adding')
          ) : (
            <>
              <svg
                viewBox="0 0 24 24"
                className="w-5 h-5 sm:hidden"
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
              <span className="hidden sm:inline">{t('item_create.add')}</span>
            </>
          )}
        </button>
      </div>
    </section>
  );
}
