const PHOTON_ENDPOINT = 'https://photon.komoot.io/api/';

// Photon only recognises a couple of the app's locales; anything else falls back to English.
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

/** GeoJSON orders coordinates lng-first; a non-finite value yields null rather than a pin nowhere. */
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

/** Whether asking again could give a different answer: 429 or 5xx; anything else only spends quota. */
export function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}
