import type { PlaceGroupRow } from '../../data/items';

// Builds the one-row-per-place shape `list_category_places` returns, not the per-item rows it groups.
export function group(
  place: string,
  overrides: Partial<Omit<PlaceGroupRow, 'place'>> = {},
): PlaceGroupRow {
  return {
    place,
    place_lat: null,
    place_lng: null,
    titles: ['An entry'],
    ids: ['row-id'],
    ...overrides,
  };
}

export function photonOk(coordinates: [number, number]) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ features: [{ geometry: { coordinates } }] }),
  };
}

export function photonFailure(status: number) {
  return { ok: false, status, json: async () => ({}) };
}
