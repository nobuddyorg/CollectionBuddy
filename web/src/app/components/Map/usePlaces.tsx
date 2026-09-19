'use client';
import { useEffect, useState } from 'react';
import {
  listCategoryPlaces,
  updateItemsPlace,
  type PlaceGroupRow,
} from '../../data/items';
import {
  coordsFromFeature,
  isRetryableStatus,
  photonLang,
  photonSearchUrl,
} from '../../data/photon';
import { backoffDelayMs } from '../../lib/backoff';
import { Place, PlaceCoords } from './types';

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

/**
 * Splits the places to draw into ones that already know where they are and
 * names that still need a lookup. `list_category_places`
 * (0014_list_category_places.sql) has already folded every item down to one
 * row per distinct place, so there is no deduplication left to do here --
 * only deciding, per place, whether the coordinates it carries are usable.
 */
export function partitionByStoredCoords(rows: PlaceGroupRow[]): {
  located: PlaceCoords[];
  unlocated: string[];
  titles: Map<string, string[]>;
  ids: Map<string, string[]>;
} {
  const located: PlaceCoords[] = [];
  const unlocated: string[] = [];
  const titles = new Map<string, string[]>();
  const ids = new Map<string, string[]>();
  for (const row of rows) {
    const { place, place_lat: lat, place_lng: lng } = row;
    titles.set(place, row.titles);
    ids.set(place, row.ids);

    // A stored NaN/Infinity/null would draw a pin nowhere and suppress the
    // geocode that would have found the place properly. `Number.isFinite`
    // already rejects `null` at runtime; the assertions below only tell the
    // compiler what this check already guarantees.
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      located.push({ name: place, lat: lat!, lng: lng! });
    } else {
      unlocated.push(place);
    }
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
  if (!Array.isArray(features)) return null;
  const coords = coordsFromFeature(features[0]);
  return coords ? { name, ...coords } : null;
}

// Photon is a free public service that sheds load by refusing requests --
// firing one per place at once got a batch mostly 429'd, with the map
// silently drawing only the pins that got through. A few at a time,
// retried on refusal.
const GEOCODE_CONCURRENCY = 3;
const GEOCODE_ATTEMPTS = 3;
const RETRY_BASE_MS = 500;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// `enabled` gates fetching behind the map actually being open, so geocoding
// every distinct place isn't paid for far more often than the map is
// looked at. `search` narrows to the entries the list is showing, not
// every entry in the category.
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
        const { data: places, error } = await listCategoryPlaces(
          categoryId,
          search,
          controller.signal,
        );

        if (error) throw new Error('Could not list places', { cause: error });

        const { located, unlocated, titles, ids } = partitionByStoredCoords(
          places ?? [],
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
            // The nesting here (effect -> fetchPlaces -> worker -> this
            // callback) is the cancellable-concurrent-queue shape itself;
            // pulling it out would mean threading `cancelled`/`titles`
            // through as parameters instead of closing over them.
            if (!cancelled)
              // eslint-disable-next-line sonarjs/no-nested-functions
              setPlaces((prev) => [...prev, withTitles(entry, titles)]);

            // Written back to every row from this place, chunked into a
            // handful of requests instead of one PATCH per item -- a place
            // shared by thousands of rows used to fire that many concurrent,
            // un-awaited requests at once, the only fan-out in the app that
            // could exhaust PostgREST's connections for every user, not just
            // this one (#PERF-H6). Best effort, not awaited: a failed write
            // just leaves it unlocated for one more lookup. The builder only
            // sends once `.then()` is called, so a handler is needed rather
            // than a plain `void`. `ids` is seeded from the same rows that
            // produced `unlocated` (and therefore this queue), so every
            // place reaching this worker already has at least one id keyed
            // here -- the assertion tells the compiler what the `Map` is
            // already guaranteed to hold.
            void updateItemsPlace(ids.get(place)!, {
              place_lat: entry.lat,
              place_lng: entry.lng,
              // eslint-disable-next-line sonarjs/no-nested-functions
            }).then(() => {});
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
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to load places:', err);
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
