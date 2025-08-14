'use client';
import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useI18n } from '../hooks/useI18n';

type PropsCreate = {
  categoryId: string;
  onCreated: () => void;
};

type NominatimHit = {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  address?: {
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
    county?: string;
    state?: string;
    country?: string;
    country_code?: string;
  };
};

export default function ItemCreate({ categoryId, onCreated }: PropsCreate) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  const [place, setPlace] = useState('');
  const [placeFocus, setPlaceFocus] = useState(false);
  const [placeResults, setPlaceResults] = useState<NominatimHit[]>([]);
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
    if (!placeFocus || place.trim().length < 2) {
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

        const url = new URL('https://nominatim.openstreetmap.org/search');
        url.searchParams.set('q', q);
        url.searchParams.set('format', 'json');
        url.searchParams.set('addressdetails', '1');
        url.searchParams.set('limit', '8');
        url.searchParams.set('accept-language', 'de');
        url.searchParams.set('countrycodes', 'de,at,ch,lu');

        const res = await fetch(url.toString(), {
          signal: ctl.signal,
          headers: { 'Accept-Language': 'de' },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: NominatimHit[] = await res.json();

        const filtered = data.filter((d) => {
          const a = d.address || {};
          return a.city || a.town || a.village || a.municipality;
        });

        setPlaceResults(filtered.slice(0, 5));
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

  const choosePlace = (hit: NominatimHit) => {
    const a = hit.address || {};
    const city =
      a.city || a.town || a.village || a.municipality || hit.display_name;
    const label = a.country ? `${city}, ${a.country}` : city;
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
    <section className="rounded-2xl border bg-white/70 dark:bg-neutral-900/60 backdrop-blur p-4 sm:p-5 shadow-sm space-y-3">
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
          className="rounded-xl border px-3 py-2 bg-white/60 dark:bg-neutral-800/70 outline-none focus:border-neutral-400 dark:focus:border-neutral-600"
        />
        <input
          aria-label={t('item_create.description')}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && createItem()}
          placeholder={t('item_create.description')}
          className="rounded-xl border px-3 py-2 bg-white/60 dark:bg-neutral-800/70 outline-none focus:border-neutral-400 dark:focus:border-neutral-600"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div className="relative" ref={dropdownRef}>
          <input
            ref={inputRef}
            aria-label={t('item_create.place_placeholder')}
            value={place}
            onChange={(e) => setPlace(e.target.value)}
            onFocus={() => setPlaceFocus(true)}
            onKeyDown={onPlaceKeyDown}
            placeholder={t('item_create.place_placeholder')}
            className="w-full rounded-xl border px-3 py-2 bg-white/60 dark:bg-neutral-800/70 outline-none focus:border-neutral-400 dark:focus:border-neutral-600"
            autoComplete="off"
          />
          {placeFocus && (placeLoading || placeResults.length > 0) && (
            <div className="absolute z-50 mt-1 w-full rounded-xl border bg-white dark:bg-neutral-900 shadow-lg overflow-hidden">
              {placeLoading && (
                <div className="px-3 py-2 text-sm opacity-70">
                  {t('item_create.searching')}
                </div>
              )}
              {!placeLoading &&
                placeResults.map((hit, i) => {
                  const a = hit.address || {};
                  const city =
                    a.city ||
                    a.town ||
                    a.village ||
                    a.municipality ||
                    hit.display_name;
                  const line2 = [a.state, a.country].filter(Boolean).join(', ');
                  return (
                    <button
                      key={hit.place_id}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => choosePlace(hit)}
                      className={`block w-full text-left px-3 py-2 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800 ${
                        i === placeIdx
                          ? 'bg-neutral-100 dark:bg-neutral-800'
                          : ''
                      }`}
                    >
                      <div className="font-medium">{city}</div>
                      <div className="opacity-70">{line2}</div>
                    </button>
                  );
                })}
              {!placeLoading && placeResults.length === 0 && (
                <div className="px-3 py-2 text-sm opacity-70">
                  {t('item_create.no_results')}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="rounded-xl border bg-white/60 dark:bg-neutral-800/70 px-2 py-1 flex flex-wrap items-center gap-1 focus-within:border-neutral-400 dark:focus-within:border-neutral-600">
          {tags.map((tag) => (
            <span
              key={tag}
              className="flex items-center gap-1 bg-neutral-200 dark:bg-neutral-700 rounded-full px-2 py-0.5 text-sm"
            >
              {tag}
              <button
                type="button"
                onClick={() => removeTag(tag)}
                className="text-neutral-600 hover:text-neutral-900 dark:text-neutral-300 dark:hover:text-white"
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
          className="rounded-xl px-4 py-2 bg-black text-white hover:brightness-110 active:scale-[0.99] disabled:opacity-60"
        >
          {isCreating ? t('item_create.adding') : t('item_create.add')}
        </button>
      </div>
    </section>
  );
}
