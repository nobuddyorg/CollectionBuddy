'use client';
import { useEffect, useState } from 'react';
import {
  listCategoryPlaces,
  updateItemsPlace,
  type PlaceGroupRow,
} from '../../data/items';
import { geocodePlace, photonLang } from '../../data/photon';
import { startSpacer } from '../../lib/backoff';
import { readStoredValue, writeStoredValue } from '../../lib/browserStorage';
import type { Coordinates } from '../../lib/coordinates';
import { runPool } from '../../lib/pool';
import { GEOCODE_CACHE_KEY, storageOwner } from '../../userDataKeys';
import { Place, PlaceCoords } from './types';

function readGeocodeCache(): Record<string, PlaceCoords> {
  try {
    return JSON.parse(readStoredValue(GEOCODE_CACHE_KEY) ?? '{}') as Record<
      string,
      PlaceCoords
    >;
  } catch {
    // A corrupt cache counts as none.
    return {};
  }
}

function writeGeocodeCache(cache: Record<string, PlaceCoords>) {
  writeStoredValue(GEOCODE_CACHE_KEY, JSON.stringify(cache));
}

async function storeGeocodedPlace(
  ids: string[],
  coords: Coordinates,
): Promise<void> {
  const { error } = await updateItemsPlace({
    ids,
    payload: { place_lat: coords.lat, place_lng: coords.lng },
  });
  if (error) console.error('Could not store a geocoded place:', error);
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

// Photon asks to be used fairly: a few lookups at a time, and together no more than three starts a second.
const GEOCODE_CONCURRENCY = 3;
const GEOCODE_START_GAP_MS = Math.ceil(1000 / 3);

const appendPlace = (place: Place) => (previous: Place[]) => [
  ...previous,
  place,
];

// `enabled` gates fetching behind the map being open; `search` narrows to the entries the list shows.
export function usePlaces({
  categoryId,
  search,
  enabled,
  canEdit,
  language,
}: {
  categoryId: string;
  search: string;
  enabled: boolean;
  canEdit: boolean;
  language?: string;
}) {
  const [places, setPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const lang = photonLang(language);

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
        const { data: rows, error } = await listCategoryPlaces({
          categoryId,
          search,
          signal: controller.signal,
        });

        if (error) throw new Error('Could not list places', { cause: error });

        const { located, unlocated, titles, ids } = partitionByStoredCoords(
          rows ?? [],
        );
        const cache = readGeocodeCache();
        const owner = storageOwner();
        let cacheDirty = false;

        const { cached, pending } = partitionByCache(unlocated, cache);
        // Everything already known lands in one batch before any request goes out.
        const known = [...located, ...cached].map((coords) =>
          withTitles(coords, titles),
        );
        if (!cancelled && known.length > 0) setPlaces(known);

        const placeCount = located.length + unlocated.length;
        let resolvedCount = known.length;

        const awaitTurn = startSpacer(GEOCODE_START_GAP_MS);
        const { signal } = controller;

        await runPool({
          items: pending,
          concurrency: GEOCODE_CONCURRENCY,
          worker: async (place) => {
            if (cancelled) return;
            const coords = await geocodePlace(place, {
              lang,
              signal,
              awaitTurn,
            });
            if (!coords) return;

            const entry = { name: place, ...coords };
            cache[place] = entry;
            cacheDirty = true;
            resolvedCount += 1;
            if (!cancelled) setPlaces(appendPlace(withTitles(entry, titles)));

            // A viewer's write-back is a no-op under RLS; the local cache still spares its next lookup.
            if (!canEdit) return;
            // Non-blocking; `ids` came from the same rows as `unlocated`, so the key exists.
            void storeGeocodedPlace(ids.get(place)!, entry);
          },
        });

        // A sign-out mid-lookup forgot this cache; writing it back would hand it to the next account.
        if (cacheDirty && storageOwner() === owner) writeGeocodeCache(cache);
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
  }, [categoryId, search, enabled, canEdit, lang]);

  return { places, loading, error };
}
