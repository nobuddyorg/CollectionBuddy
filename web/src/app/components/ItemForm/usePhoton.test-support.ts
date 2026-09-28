import type { PhotonFeature } from '../../data/photon';

export function placeProperties(
  partial: Partial<PhotonFeature['properties']> = {},
): PhotonFeature['properties'] {
  return {
    osm_id: 1,
    ...partial,
  };
}

export function feature(
  osm_id: number,
  partial: Partial<PhotonFeature['properties']> = {},
): PhotonFeature {
  return {
    properties: placeProperties({ osm_id, ...partial }),
    geometry: { type: 'Point', coordinates: [0, 0] },
  };
}

export function photonAnswer(features: PhotonFeature[] = []) {
  return { ok: true, json: async () => ({ features }) };
}
