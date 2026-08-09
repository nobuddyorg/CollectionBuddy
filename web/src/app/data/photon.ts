// The Photon client both geocoding surfaces in this app go through:
// interactive autocomplete while typing (ItemForm/usePhoton.tsx) and the
// map's background lookup of already-catalogued place names
// (Map/usePlaces.tsx). They used to hit the endpoint independently, each
// with its own `lang` handling and -- worse -- two coordinate validators
// that disagreed on NaN: one rejected it, one didn't, so the same malformed
// response was silently dropped by one caller and drawn as a pin at
// nowhere by the other. Both hooks hold only their own UI state now; this
// is where the transport-level pieces they actually shared are defined
// once.

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
 * destructured the "wrong" way round. The type says this is always a
 * numeric pair; the runtime data is a third party's, so it's checked
 * rather than trusted -- `Number.isFinite` in one step, since it coerces
 * nothing: a missing element, a string and a NaN all fail it alike. A NaN
 * slipping through would put a pin nowhere and, worse, suppress whatever
 * fallback would otherwise have found the place properly.
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
 * Whether asking again could plausibly give a different answer.
 *
 * A refusal to serve right now (429) and a service that is broken right
 * now (5xx) are worth another go. Anything else is the service having
 * understood the question and answered it, and repeating it verbatim only
 * spends someone else's quota.
 */
export function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}
