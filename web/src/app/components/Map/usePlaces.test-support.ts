import type { PlaceGroupRow } from '../../data/items';

// Builds the one-row-per-place shape `list_category_places` returns, not the per-item rows it groups.
export function group(
  place: string,
  place_lat: number | null = null,
  place_lng: number | null = null,
  titles: string[] = ['An entry'],
  ids: string[] = ['row-id'],
): PlaceGroupRow {
  return { place, place_lat, place_lng, titles, ids };
}

export function photonOk(coordinates: [number, number]) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ features: [{ geometry: { coordinates } }] }),
  };
}
