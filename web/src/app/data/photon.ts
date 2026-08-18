// Shared Photon transport for both geocoding surfaces (ItemForm/usePhoton.tsx
// and Map/usePlaces.tsx). They used to hit the endpoint independently, with
// two coordinate validators that disagreed on NaN -- one caller silently
// dropped a malformed response, the other drew a pin at nowhere.

const PHOTON_ENDPOINT = 'https://photon.komoot.io/api/';

// Photon only recognises a couple of the app's locales; anything else
// falls back to English.
export function photonLang(locale?: string): 'de' | 'en' {
  return locale === 'de' ? 'de' : 'en';
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

/**
 * Reads the coordinates off a Photon feature, or null if it carries none
 * usable. GeoJSON orders coordinates lng-first, so the pair is deliberately
 * destructured the "wrong" way round. Checked with `Number.isFinite` rather
 * than trusted, since the runtime data is a third party's and a NaN slipping
 * through would put a pin nowhere.
 */
export function coordsFromFeature(
  feature: unknown,
): { lat: number; lng: number } | null {
  const coordinates = (feature as { geometry?: { coordinates?: unknown } })
    ?.geometry?.coordinates;
  if (!Array.isArray(coordinates)) return null;
  const [lng, lat] = coordinates as number[];
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

/**
 * Whether asking again could plausibly give a different answer: a refusal
 * to serve right now (429) or a broken service (5xx). Anything else is an
 * understood answer, and repeating it only spends quota.
 */
export function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}
