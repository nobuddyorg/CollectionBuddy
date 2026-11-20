import type { Coordinates } from '../../lib/coordinates';
import type { ItemFormValues } from './types';

/** Whether a save names a place it has no coordinates for: typed without picking a suggestion, or never located. */
export function needsLocating(
  values: Pick<ItemFormValues, 'place' | 'place_lat' | 'place_lng'>,
): boolean {
  if (!values.place.trim()) return false;
  return !(
    Number.isFinite(values.place_lat) && Number.isFinite(values.place_lng)
  );
}

/** `values` with the coordinates `lookUp` finds for its place, where it needs them; otherwise `values` itself. */
export async function withLocatedPlace(
  values: ItemFormValues,
  lookUp: (place: string) => Promise<Coordinates | null>,
): Promise<ItemFormValues> {
  if (!needsLocating(values)) return values;
  const coords = await lookUp(values.place.trim());
  if (!coords) return values;
  return { ...values, place_lat: coords.lat, place_lng: coords.lng };
}
