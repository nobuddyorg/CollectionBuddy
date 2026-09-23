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
import { attempts, backoffDelayMs } from '../../lib/backoff';
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

/** `list_category_places` already yields one row per distinct place, so nothing is deduplicated here. */
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

    // A stored NaN/Infinity/null would pin nowhere and suppress the geocode that finds the place.
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      located.push({ name: place, lat: lat!, lng: lng! });
    } else {
      unlocated.push(place);
    }
  }
  return { located, unlocated, titles, ids };
}

/** A place without any row behind it gets an empty list, not a missing one, so the popup still draws. */
export function withTitles(
  coords: PlaceCoords,
  titles: Map<string, string[]>,
): Place {
  return { ...coords, titles: titles.get(coords.name) ?? [] };
}

/** Splits places into cache hits and names still needing a lookup, preserving input order in both. */
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

/** Reads a Place out of a Photon response via the same coordinate validator the form's autocomplete uses. */
export function placeFromPhotonResponse(
  name: string,
  data: unknown,
): PlaceCoords | null {
  const features = (data as { features?: unknown })?.features;
  if (!Array.isArray(features)) return null;
  const coords = coordsFromFeature(features[0]);
  return coords ? { name, ...coords } : null;
}

// Photon is a free service that sheds load with 429s, so lookups go a few at a time and retry on refusal.
const GEOCODE_CONCURRENCY = 3;
const GEOCODE_ATTEMPTS = 3;
const RETRY_BASE_MS = 500;

const delay = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

const appendPlace = (place: Place) => (previous: Place[]) => [
  ...previous,
  place,
];

// `enabled` gates fetching behind the map being open; `search` narrows to the entries the list shows.
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
    // Aborts a superseded request's own fetch, not just its effect on state.
    const controller = new AbortController();

    const fetchPlaces = async () => {
      setLoading(true);
      setError(false);
      setPlaces([]);
      try {
        const { data: rows, error } = await listCategoryPlaces(
          categoryId,
          search,
          controller.signal,
        );

        if (error) throw new Error('Could not list places', { cause: error });

        const { located, unlocated, titles, ids } = partitionByStoredCoords(
          rows ?? [],
        );
        const cache = readGeocodeCache();
        let cacheDirty = false;

        const { cached, pending } = partitionByCache(unlocated, cache);
        // Everything already known lands in one batch before any request goes out.
        const known = [...located, ...cached].map((coords) =>
          withTitles(coords, titles),
        );
        if (!cancelled && known.length > 0) setPlaces(known);

        const placeCount = located.length + unlocated.length;
        let resolvedCount = known.length;

        const geocode = async (place: string): Promise<PlaceCoords | null> => {
          for (const attempt of attempts(GEOCODE_ATTEMPTS)) {
            if (cancelled) return null;
            try {
              const url = photonSearchUrl(place, { limit: 1, lang });
              const response = await fetch(url);
              // A place the gazetteer does not know will not be known on the third try.
              if (response.ok)
                return placeFromPhotonResponse(place, await response.json());
              if (!isRetryableStatus(response.status)) return null;
            } catch {
              // A network error is worth another go, same as a refusal.
            }
            await delay(backoffDelayMs(RETRY_BASE_MS, attempt));
          }
          return null;
        };

        // Drained by a few workers rather than let loose at once; pins still appear as each lookup lands.
        const queue = [...pending];
        const worker = async () => {
          // Drained in the loop header: the walk ends when the queue does, whatever the body did.
          for (
            let place = queue.shift();
            place !== undefined;
            place = queue.shift()
          ) {
            // No cancellation check of its own: `geocode` fails closed on `cancelled` before the network.
            const entry = await geocode(place);
            if (!entry) continue;

            cache[place] = entry;
            cacheDirty = true;
            resolvedCount += 1;
            if (!cancelled) setPlaces(appendPlace(withTitles(entry, titles)));

            // Fire-and-forget write-back; `ids` came from the same rows as `unlocated`, so the key exists.
            void updateItemsPlace(ids.get(place)!, {
              place_lat: entry.lat,
              place_lng: entry.lng,
            });
          }
        };

        await Promise.all(
          Array.from(
            { length: Math.min(GEOCODE_CONCURRENCY, queue.length) },
            worker,
          ),
        );

        if (cacheDirty) writeGeocodeCache(cache);
        // Every place failed, not "nothing to geocode": tells a broken geocoder from nothing to show.
        if (!cancelled && placeCount > 0 && resolvedCount === 0) {
          setError(true);
        }
      } catch (error) {
        if (!cancelled) {
          console.error('Failed to load places:', error);
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
