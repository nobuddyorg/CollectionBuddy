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

// Photon is a free public service with no API key, and it sheds load by
// refusing requests. Firing one per unknown place at once is what got them
// refused: a batch of a dozen came back mostly 429, every refusal was
// swallowed, and the map drew the one or two pins that got through as if
// that were the whole collection. A few at a time, and asked again if the
// answer was "not now".
const GEOCODE_CONCURRENCY = 3;
const GEOCODE_ATTEMPTS = 3;
const RETRY_BASE_MS = 500;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Whether asking again could plausibly give a different answer.
 *
 * A refusal to serve right now (429) and a service that is broken right now
 * (5xx) are worth another go. Anything else is the service having understood
 * the question and answered it, and repeating it verbatim only spends
 * someone else's quota.
 */
export function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
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

        // One place, asked for as many times as it is worth asking. Returns
        // null once the answer is settled -- either the service named
        // nowhere, or it kept refusing.
        const geocode = async (place: string): Promise<Place | null> => {
          for (let attempt = 0; attempt < GEOCODE_ATTEMPTS; attempt += 1) {
            if (cancelled) return null;
            try {
              const url = new URL('https://photon.komoot.io/api/');
              url.searchParams.set('q', place);
              url.searchParams.set('limit', '1');
              const res = await fetch(url.toString());
              // An answer, even an empty one: a place the gazetteer does not
              // know is not going to be known on the third try.
              if (res.ok)
                return placeFromPhotonResponse(place, await res.json());
              if (!isRetryableStatus(res.status)) return null;
            } catch {
              // A network error is worth another go, same as a refusal.
            }
            // Backing off rather than hammering: the point of the wait is to
            // give the service a moment to stop refusing.
            await delay(RETRY_BASE_MS * 2 ** attempt);
          }
          return null;
        };

        // A queue drained by a few workers, rather than the whole batch let
        // loose at once. Pins still appear as each lookup lands -- one slow
        // geocode holds back nothing but its own place in the queue.
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
            if (!cancelled) setPlaces((prev) => [...prev, entry]);
          }
        };

        await Promise.all(
          Array.from(
            { length: Math.min(GEOCODE_CONCURRENCY, queue.length) },
            worker,
          ),
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
