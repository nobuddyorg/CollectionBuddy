'use client';
import { useEffect, useState } from 'react';
import {
  listItemPlaces,
  updateItem,
  type ItemPlaceRow,
} from '../../data/items';
import {
  coordsFromFeature,
  isRetryableStatus,
  photonLang,
  photonSearchUrl,
} from '../../data/photon';
import { backoffDelayMs } from '../../lib/backoff';
import { Place, PlaceCoords } from './types';

// Stryker disable all: localStorage, and two try/catch wrappers whose whole
// content is "carry on without the cache". Mutating them scores how well the
// storage API is stubbed rather than anything about the app.
const GEOCODE_CACHE_KEY = 'cb_geocode_cache_v1';

function readGeocodeCache(): Record<string, PlaceCoords> {
  try {
    return JSON.parse(
      localStorage.getItem(GEOCODE_CACHE_KEY) ?? '{}',
    ) as Record<string, PlaceCoords>;
  } catch {
    return {};
  }
}

function writeGeocodeCache(cache: Record<string, PlaceCoords>) {
  try {
    localStorage.setItem(GEOCODE_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Best-effort: geocoding still works without a cache.
  }
}
// Stryker restore all

/**
 * Splits the rows to draw into places that already know where they are and
 * names that still need a lookup, deduplicated by name. A name is only
 * unlocated if *no* row carrying it has coordinates.
 */
export function partitionByStoredCoords(rows: ItemPlaceRow[]): {
  located: PlaceCoords[];
  unlocated: string[];
  titles: Map<string, string[]>;
  ids: Map<string, string[]>;
} {
  const byName = new Map<string, PlaceCoords>();
  const titles = new Map<string, string[]>();
  const ids = new Map<string, string[]>();
  for (const row of rows) {
    const { id, place, title, place_lat: lat, place_lng: lng } = row;
    if (!place) continue;

    // Every entry at this place, including rows with no coordinates of
    // their own -- a neighbouring row may say where "there" is.
    const at = titles.get(place);
    if (at) at.push(title);
    else titles.set(place, [title]);

    // Once the place is geocoded, the answer is written back to every row
    // named here.
    const idsAt = ids.get(place);
    if (idsAt) idsAt.push(id);
    else ids.set(place, [id]);

    if (byName.has(place)) continue;
    // Not a type guard on its own -- narrows the pair to `number` for the
    // compiler. Number.isFinite below rejects null too, so this line is
    // unobservable at runtime.
    // Stryker disable next-line all
    if (lat == null || lng == null) continue;
    // A stored NaN would draw a pin nowhere and suppress the geocode that
    // would have found the place properly.
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    byName.set(place, { name: place, lat, lng });
  }

  const located: PlaceCoords[] = [];
  const unlocated: string[] = [];
  const seen = new Set<string>();
  for (const { place } of rows) {
    if (!place || seen.has(place)) continue;
    seen.add(place);
    const hit = byName.get(place);
    if (hit) located.push(hit);
    else unlocated.push(place);
  }
  return { located, unlocated, titles, ids };
}

/**
 * Puts a located place back together with the entries catalogued there. A
 * place located without any row behind it gets an empty list rather than a
 * missing one, so the popup still draws its name.
 */
export function withTitles(
  coords: PlaceCoords,
  titles: Map<string, string[]>,
): Place {
  return { ...coords, titles: titles.get(coords.name) ?? [] };
}

/**
 * Splits the places to draw into the ones the cache already answers and the
 * ones still needing a lookup, preserving input order in both.
 */
export function partitionByCache(
  places: string[],
  cache: Record<string, PlaceCoords>,
): { cached: PlaceCoords[]; pending: string[] } {
  const cached: PlaceCoords[] = [];
  const pending: string[] = [];
  for (const place of places) {
    const hit = cache[place];
    if (hit) cached.push(hit);
    else pending.push(place);
  }
  return { cached, pending };
}

/**
 * Reads a Place out of a Photon response, via the same coordinate validator
 * the form's autocomplete uses (`data/photon.ts`).
 */
export function placeFromPhotonResponse(
  name: string,
  data: unknown,
): PlaceCoords | null {
  const features = (data as { features?: unknown })?.features;
  // Shortcut, not a guard: an empty array falls through to the same null
  // anyway, but "no matches" reads better stated up top.
  // Stryker disable next-line all
  if (!Array.isArray(features) || features.length === 0) return null;
  const coords = coordsFromFeature(features[0]);
  return coords ? { name, ...coords } : null;
}

// Photon is a free public service that sheds load by refusing requests --
// firing one per place at once got a batch mostly 429'd, with the map
// silently drawing only the pins that got through. A few at a time,
// retried on refusal.
// Stryker disable all: a test can restate "three at a time" but can't
// judge whether three is right.
const GEOCODE_CONCURRENCY = 3;
const GEOCODE_ATTEMPTS = 3;
const RETRY_BASE_MS = 500;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
// Stryker restore all

// `enabled` gates fetching behind the map actually being open, so geocoding
// every distinct place isn't paid for far more often than the map is
// looked at. `search` narrows to the entries the list is showing, not
// every entry in the category.
// Stryker disable all: hook internals -- Supabase I/O and a geocoding
// queue, none of it reachable without stubbing the network. The four
// exported functions above carry the logic worth scoring.
export function usePlaces(
  categoryId: string,
  search: string,
  enabled: boolean,
  locale?: string,
) {
  const [places, setPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const lang = photonLang(locale);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    // Aborts a superseded request's own fetch, not just its effect on
    // state -- otherwise the response still finishes downloading after a
    // map that's moved on has already discarded it via `cancelled`.
    const controller = new AbortController();

    const fetchPlaces = async () => {
      setLoading(true);
      setError(false);
      setPlaces([]);
      try {
        const { data: items, error } = await listItemPlaces(
          categoryId,
          search,
          controller.signal,
        );

        if (error) throw new Error('Could not list places', { cause: error });

        const { located, unlocated, titles, ids } = partitionByStoredCoords(
          items ?? [],
        );
        const cache = readGeocodeCache();
        let cacheDirty = false;

        const { cached, pending } = partitionByCache(unlocated, cache);
        // Everything already known lands in one batch before any request
        // goes out, so the map draws those pins immediately.
        const known = [...located, ...cached].map((c) => withTitles(c, titles));
        if (!cancelled && known.length > 0) setPlaces(known);

        const placeCount = located.length + unlocated.length;
        let resolvedCount = known.length;

        const geocode = async (place: string): Promise<PlaceCoords | null> => {
          for (let attempt = 0; attempt < GEOCODE_ATTEMPTS; attempt += 1) {
            if (cancelled) return null;
            try {
              const url = photonSearchUrl(place, { limit: 1, lang });
              const res = await fetch(url);
              // A place the gazetteer doesn't know isn't going to be known
              // on the third try.
              if (res.ok)
                return placeFromPhotonResponse(place, await res.json());
              if (!isRetryableStatus(res.status)) return null;
            } catch {
              // A network error is worth another go, same as a refusal.
            }
            await delay(backoffDelayMs(RETRY_BASE_MS, attempt));
          }
          return null;
        };

        // Drained by a few workers rather than let loose at once -- pins
        // still appear as each lookup lands.
        const queue = [...pending];
        const worker = async () => {
          for (;;) {
            const place = queue.shift();
            if (place === undefined || cancelled) return;
            const entry = await geocode(place);
            if (!entry) continue;

            cache[place] = entry;
            cacheDirty = true;
            resolvedCount += 1;
            if (!cancelled)
              setPlaces((prev) => [...prev, withTitles(entry, titles)]);

            // Written back to every row from this place, so the next open
            // reads it instead of asking the gazetteer again. Best effort,
            // not awaited: a failed write just leaves it unlocated for one
            // more lookup. The builder only sends once `.then()` is called,
            // so a handler is needed rather than a plain `void`.
            for (const id of ids.get(place) ?? []) {
              void updateItem(id, {
                place_lat: entry.lat,
                place_lng: entry.lng,
              }).then(() => {});
            }
          }
        };

        await Promise.all(
          Array.from(
            { length: Math.min(GEOCODE_CONCURRENCY, queue.length) },
            worker,
          ),
        );

        if (cacheDirty) writeGeocodeCache(cache);
        // Every place failed, not "no places to geocode" -- distinguish
        // "geocoding is broken" from "nothing to show".
        if (!cancelled && placeCount > 0 && resolvedCount === 0) {
          setError(true);
        }
      } catch {
        if (!cancelled) {
          setPlaces([]);
          setError(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void fetchPlaces();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [categoryId, search, enabled, lang]);

  return { places, loading, error };
}
// Stryker restore all
