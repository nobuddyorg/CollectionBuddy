import { isRetryableStatus, retryWithBackoff } from '../lib/backoff';
import type { Coordinates } from '../lib/coordinates';

const PHOTON_ENDPOINT = 'https://photon.komoot.io/api/';

export type PhotonFeature = {
  properties: {
    osm_id: number;
    name?: string;
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
    state?: string;
    country?: string;
    countrycode?: string;
  };
  geometry: { type: 'Point'; coordinates: [number, number] };
};

// Photon only recognises a couple of the app's languages; anything else falls back to English.
export function photonLang(language?: string): 'de' | 'en' {
  return language === 'de' ? 'de' : 'en';
}

export function photonSearchUrl(
  query: string,
  { limit, lang }: { limit: number; lang?: string },
): string {
  const url = new URL(PHOTON_ENDPOINT);
  url.searchParams.set('q', query);
  url.searchParams.set('limit', String(limit));
  if (lang) url.searchParams.set('lang', lang);
  return url.toString();
}

/** An abort rejects with fetch's own DOMException, untouched: callers tell a superseded search from a failure by it. */
export async function searchPhotonFeatures(
  query: string,
  { limit, lang, signal }: { limit: number; lang: string; signal: AbortSignal },
): Promise<PhotonFeature[]> {
  const response = await fetch(photonSearchUrl(query, { limit, lang }), {
    signal,
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return ((await response.json()) as { features: PhotonFeature[] }).features;
}

/** GeoJSON orders coordinates lng-first; a non-finite value yields null rather than a pin nowhere. */
export function coordsFromFeature(feature: unknown): Coordinates | null {
  const coordinates = (feature as { geometry?: { coordinates?: unknown } })
    ?.geometry?.coordinates;
  if (!Array.isArray(coordinates)) return null;
  const [lng, lat] = coordinates as number[];
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

/** The first feature's coordinates, via the same validator the form's autocomplete uses. */
export function coordsFromPhotonResponse(data: unknown): Coordinates | null {
  const features = (data as { features?: unknown })?.features;
  if (!Array.isArray(features)) return null;
  return coordsFromFeature(features[0]);
}

// Photon is a free service that sheds load with 429s, so a lookup retries a refusal with backoff.
const GEOCODE_ATTEMPTS = 3;
const GEOCODE_RETRY_BASE_MS = 500;

/** Where Photon puts `place`; null when it does not know it, keeps refusing, or `signal` aborts. `awaitTurn` paces every attempt. */
export function geocodePlace(
  place: string,
  {
    lang,
    signal,
    awaitTurn,
  }: { lang: string; signal: AbortSignal; awaitTurn: () => Promise<void> },
): Promise<Coordinates | null> {
  return retryWithBackoff({
    maxAttempts: GEOCODE_ATTEMPTS,
    baseMs: GEOCODE_RETRY_BASE_MS,
    run: async () => {
      await awaitTurn();
      if (signal.aborted) return { value: null, retry: false };
      try {
        const url = photonSearchUrl(place, { limit: 1, lang });
        const response = await fetch(url, { signal });
        // A place the gazetteer does not know will not be known on the third try.
        if (response.ok)
          return {
            value: coordsFromPhotonResponse(await response.json()),
            retry: false,
          };
        return { value: null, retry: isRetryableStatus(response.status) };
      } catch {
        // A network error is worth another go, same as a refusal; an abort is not.
        return { value: null, retry: !signal.aborted };
      }
    },
  });
}
