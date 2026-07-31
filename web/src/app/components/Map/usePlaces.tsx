'use client';
import { useEffect, useState } from 'react';
import { listItemPlaces } from '../../data/items';
import { Place } from './types';

const GEOCODE_CACHE_KEY = 'cb_geocode_cache_v1';

function readGeocodeCache(): Record<string, Place> {
  try {
    return JSON.parse(localStorage.getItem(GEOCODE_CACHE_KEY) ?? '{}');
  } catch {
    return {};
  }
}

function writeGeocodeCache(cache: Record<string, Place>) {
  try {
    localStorage.setItem(GEOCODE_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Storage full or unavailable (private browsing) -- caching is
    // best-effort, geocoding still works without it.
  }
}

/**
 * Splits the places to draw into the ones the cache already answers and the
 * ones still needing a lookup, preserving input order in both.
 */
export function partitionByCache(
  places: string[],
  cache: Record<string, Place>,
): { cached: Place[]; pending: string[] } {
  const cached: Place[] = [];
  const pending: string[] = [];
  for (const place of places) {
    const hit = cache[place];
    if (hit) cached.push(hit);
    else pending.push(place);
  }
  return { cached, pending };
}

/**
 * Reads a Place out of a Photon response. GeoJSON orders coordinates
 * lng-first, so the pair is deliberately destructured the "wrong" way round.
 */
export function placeFromPhotonResponse(
  name: string,
  data: unknown,
): Place | null {
  const features = (data as { features?: unknown })?.features;
  if (!Array.isArray(features) || features.length === 0) return null;
  const coordinates = (
    features[0] as { geometry?: { coordinates?: unknown } } | undefined
  )?.geometry?.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null;
  const [lng, lat] = coordinates as number[];
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  return { name, lat, lng };
}

// `enabled` gates fetching behind the map actually being open: geocoding
// every distinct place is an unbounded number of requests to a free public
// API, and running it on category *selection* rather than map *open* paid
// that cost far more often than the map was ever looked at.
export function usePlaces(categoryId: string, enabled: boolean) {
  const [places, setPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    const fetchPlaces = async () => {
      setLoading(true);
      setError(false);
      setPlaces([]);
      try {
        const { data: items, error } = await listItemPlaces(categoryId);

        if (error) throw error;

        const uniquePlaces = Array.from(new Set(items.map((i) => i.place!)));
        const cache = readGeocodeCache();
        let cacheDirty = false;

        const { cached, pending } = partitionByCache(uniquePlaces, cache);
        // Cached places land in one batch before any request goes out, so a
        // second visit draws its pins immediately instead of waiting on the
        // slowest lookup of the batch.
        if (!cancelled && cached.length > 0) setPlaces(cached);

        let resolvedCount = cached.length;

        await Promise.all(
          pending.map(async (place) => {
            try {
              const url = new URL('https://photon.komoot.io/api/');
              url.searchParams.set('q', place);
              url.searchParams.set('limit', '1');
              const res = await fetch(url.toString());
              if (!res.ok) return;
              const entry = placeFromPhotonResponse(place, await res.json());
              if (!entry) return;

              cache[place] = entry;
              cacheDirty = true;
              resolvedCount += 1;
              // Appended as each lookup lands rather than after the whole
              // batch: a single slow geocode no longer holds back every
              // other pin.
              if (!cancelled) setPlaces((prev) => [...prev, entry]);
            } catch {
              // A place that can't be geocoded is simply not drawn.
            }
          }),
        );

        if (cacheDirty) writeGeocodeCache(cache);
        // Every place failed to geocode (as opposed to there being no
        // places to geocode) -- distinguish "geocoding is broken" from
        // "nothing to show" instead of silently rendering an empty map.
        if (!cancelled && uniquePlaces.length > 0 && resolvedCount === 0) {
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
    };
  }, [categoryId, enabled]);

  return { places, loading, error };
}
