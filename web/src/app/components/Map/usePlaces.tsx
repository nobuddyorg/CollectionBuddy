'use client';
import { useEffect, useState } from 'react';
import { supabase } from '../../supabase';
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
      try {
        const { data: items, error } = await supabase
          .from('items')
          .select('place,item_categories!inner(category_id)')
          .eq('item_categories.category_id', categoryId)
          .not('place', 'is', null)
          .neq('place', '');

        if (error) throw error;

        const uniquePlaces = Array.from(new Set(items.map((i) => i.place!)));
        const cache = readGeocodeCache();
        let cacheDirty = false;

        const placeCoordinates = await Promise.all(
          uniquePlaces.map(async (place) => {
            const cached = cache[place];
            if (cached) return cached;

            try {
              const url = new URL('https://photon.komoot.io/api/');
              url.searchParams.set('q', place);
              url.searchParams.set('limit', '1');
              const res = await fetch(url.toString());
              if (!res.ok) return null;
              const data = await res.json();
              if (data.features && data.features.length > 0) {
                const [lng, lat] = data.features[0].geometry.coordinates;
                const entry: Place = { name: place, lat, lng };
                cache[place] = entry;
                cacheDirty = true;
                return entry;
              }
              return null;
            } catch {
              return null;
            }
          }),
        );

        if (cacheDirty) writeGeocodeCache(cache);
        if (!cancelled) {
          const resolved = placeCoordinates.filter(
            (p): p is Place => p !== null,
          );
          setPlaces(resolved);
          // Every place failed to geocode (as opposed to there being no
          // places to geocode) -- distinguish "geocoding is broken" from
          // "nothing to show" instead of silently rendering an empty map.
          if (uniquePlaces.length > 0 && resolved.length === 0) {
            setError(true);
          }
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
