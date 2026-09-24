import type { PhotonFeature } from './types';

export function props(
  partial: Partial<PhotonFeature['properties']> = {},
): PhotonFeature['properties'] {
  return {
    osm_id: 1,
    osm_type: 'N',
    osm_key: 'place',
    osm_value: 'city',
    ...partial,
  };
}

export function feature(
  osm_id: number,
  partial: Partial<PhotonFeature['properties']> = {},
): PhotonFeature {
  return {
    properties: props({ osm_id, ...partial }),
    geometry: { type: 'Point', coordinates: [0, 0] },
  };
}
