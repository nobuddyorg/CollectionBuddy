'use client';
import { useEffect, useState } from 'react';
import { listItemPlaces, type ItemPlaceRow } from '../../data/items';
import { Place } from './types';

// Stryker disable all: localStorage, and two try/catch wrappers whose whole
// content is "carry on without the cache". Mutating them scores how well the
// storage API is stubbed rather than anything about the app.
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
// Stryker restore all

/**
 * Splits the rows to draw into places that already know where they are and
 * names that still have to be looked up, preserving input order in both and
 * deduplicating by name across the pair.
 *
 * Coordinates are stored at entry time (`0015_place_coordinates.sql`), so
 * anything entered by picking a suggestion arrives ready to draw. A name is
 * only unlocated if *no* row carrying it has coordinates -- one item entered
 * before this shipped doesn't force a lookup for a place another item
 * already located.
 */
export function partitionByStoredCoords(rows: ItemPlaceRow[]): {
  located: Place[];
  unlocated: string[];
} {
  const byName = new Map<string, Place>();
  for (const row of rows) {
    const { place, place_lat: lat, place_lng: lng } = row;
    if (!place || byName.has(place)) continue;
    // Null is the normal state of older and hand-typed rows. Checked
    // separately from the finite test below because `Number.isFinite`,
    // while it does reject null, isn't a type guard -- this is what
    // narrows the pair to `number` for the Place built underneath.
    //
    // Which also makes every mutant of this line equivalent: at runtime
    // `Number.isFinite` rejects null too, so removing or weakening the check
    // changes nothing a test could observe. It is here for the compiler.
    // Stryker disable next-line all
    if (lat == null || lng == null) continue;
    // A stored NaN would draw a pin nowhere *and* suppress the geocode
    // that would have found the place properly.
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    byName.set(place, { name: place, lat, lng });
  }

  const located: Place[] = [];
  const unlocated: string[] = [];
  const seen = new Set<string>();
  for (const { place } of rows) {
    if (!place || seen.has(place)) continue;
    seen.add(place);
    const hit = byName.get(place);
    if (hit) located.push(hit);
    else unlocated.push(place);
  }
  return { located, unlocated };
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
  // The emptiness test is a shortcut, not a guard: an empty array falls
  // through the reads below and lands on the same null anyway, so dropping it
  // is unobservable. Kept because "no matches" is the ordinary answer here
  // and saying so at the top reads better than discovering it three lines on.
  // Stryker disable next-line all
  if (!Array.isArray(features) || features.length === 0) return null;
  const coordinates = (
    features[0] as { geometry?: { coordinates?: unknown } } | undefined
  )?.geometry?.coordinates;
  // Same again: a one-element array leaves `lat` undefined and is refused by
  // the type check below, so the length test only makes the intent legible.
  // Stryker disable next-line all
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
// Stryker disable all: rate-limiting numbers and a sleep. A test can restate
// "three at a time" but cannot say whether three is right -- that was learned
// from Photon refusing the requests, not from an assertion.
const GEOCODE_CONCURRENCY = 3;
const GEOCODE_ATTEMPTS = 3;
const RETRY_BASE_MS = 500;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
// Stryker restore all

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
//
// `search` is the same term the list is filtered by, already debounced by the
// caller -- the map draws the entries the list is showing, not every entry in
// the category (#241). Narrowing can only ever shorten the geocoding queue.
// Stryker disable all: hook internals -- Supabase I/O, a geocoding queue and
// its retries, none of it reachable without stubbing the network. The four
// exported functions above are the logic worth scoring, and they are; mutants
// down here would only measure how elaborately the fetch was faked.
export function usePlaces(
  categoryId: string,
  search: string,
  enabled: boolean,
) {
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
        const { data: items, error } = await listItemPlaces(categoryId, search);

        if (error) throw error;

        // Places entered since 0015 carry their own coordinates and skip
        // the gazetteer entirely; only what's left over is looked up.
        const { located, unlocated } = partitionByStoredCoords(items);
        const cache = readGeocodeCache();
        let cacheDirty = false;

        const { cached, pending } = partitionByCache(unlocated, cache);
        // Everything already known lands in one batch before any request
        // goes out, so the map draws those pins immediately instead of
        // waiting on the slowest lookup of the batch.
        const known = [...located, ...cached];
        if (!cancelled && known.length > 0) setPlaces(known);

        const placeCount = located.length + unlocated.length;
        let resolvedCount = known.length;

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
    };
  }, [categoryId, search, enabled]);

  return { places, loading, error };
}
// Stryker restore all
