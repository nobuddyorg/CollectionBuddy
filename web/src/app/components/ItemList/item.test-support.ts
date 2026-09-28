import type { ItemLite } from './types';

export function item(id: string, overrides: Partial<ItemLite> = {}): ItemLite {
  return {
    id,
    title: `Item ${id}`,
    description: null,
    place: null,
    place_lat: null,
    place_lng: null,
    tags: [],
    ...overrides,
  };
}
