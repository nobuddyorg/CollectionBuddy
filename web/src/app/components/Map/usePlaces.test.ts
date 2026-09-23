import { describe, expect, it } from 'vitest';

import {
  partitionByCache,
  partitionByStoredCoords,
  placeFromPhotonResponse,
  withTitles,
} from './usePlaces';
import type { PlaceCoords } from './types';
import type { PlaceGroupRow } from '../../data/items';

const cologne: PlaceCoords = { name: 'Cologne', lat: 50.94, lng: 6.96 };
const berlin: PlaceCoords = { name: 'Berlin', lat: 52.52, lng: 13.4 };

function photon(coordinates: unknown) {
  return { features: [{ geometry: { coordinates } }] };
}

// Builds the one-row-per-place shape `list_category_places` returns, not the per-item rows it groups.
function group(
  place: string,
  place_lat: number | null = null,
  place_lng: number | null = null,
  titles: string[] = ['An entry'],
  ids: string[] = ['row-id'],
): PlaceGroupRow {
  return { place, place_lat, place_lng, titles, ids };
}

describe('partitionByStoredCoords', () => {
  it('draws a place with a stored coordinate pair, and lists the rest as unlocated', () => {
    const { located, unlocated } = partitionByStoredCoords([
      group('Cologne', 50.94, 6.96),
      group('Paris'),
      group('Berlin', 52.52, 13.4),
    ]);
    expect(located).toEqual([cologne, berlin]);
    expect(unlocated).toEqual(['Paris']);
  });

  it('preserves input order within each side of the split', () => {
    const { located, unlocated } = partitionByStoredCoords([
      group('Berlin', 52.52, 13.4),
      group('Paris'),
      group('Cologne', 50.94, 6.96),
      group('Rome'),
    ]);
    expect(located).toEqual([berlin, cologne]);
    expect(unlocated).toEqual(['Paris', 'Rome']);
  });

  it('falls back to a lookup when only one coordinate was stored', () => {
    expect(
      partitionByStoredCoords([group('Cologne', 50.94, null)]),
    ).toMatchObject({ located: [], unlocated: ['Cologne'] });
    expect(
      partitionByStoredCoords([group('Cologne', null, 6.96)]),
    ).toMatchObject({ located: [], unlocated: ['Cologne'] });
  });

  it('falls back to a lookup rather than pinning a non-finite coordinate', () => {
    expect(partitionByStoredCoords([group('Broken', NaN, 6.96)])).toMatchObject(
      { located: [], unlocated: ['Broken'] },
    );
    expect(
      partitionByStoredCoords([group('Broken', 50.94, Infinity)]),
    ).toMatchObject({ located: [], unlocated: ['Broken'] });
  });

  it('treats zero coordinates as a real location, not a missing one', () => {
    expect(partitionByStoredCoords([group('Null Island', 0, 0)])).toMatchObject(
      {
        located: [{ name: 'Null Island', lat: 0, lng: 0 }],
        unlocated: [],
      },
    );
  });

  it('has nothing to do for an empty row list', () => {
    expect(partitionByStoredCoords([])).toMatchObject({
      located: [],
      unlocated: [],
    });
  });
});

describe('partitionByStoredCoords, on the entries at each place', () => {
  it('carries through the titles and ids the row already grouped', () => {
    const { titles, ids } = partitionByStoredCoords([
      group(
        'Cologne',
        50.94,
        6.96,
        ['Seated Dime', 'Silver Eagle'],
        ['item-1', 'item-2'],
      ),
      group('Berlin', 52.52, 13.4, ['Buffalo Nickel'], ['item-3']),
    ]);
    expect(titles.get('Cologne')).toEqual(['Seated Dime', 'Silver Eagle']);
    expect(titles.get('Berlin')).toEqual(['Buffalo Nickel']);
    expect(ids.get('Cologne')).toEqual(['item-1', 'item-2']);
    expect(ids.get('Berlin')).toEqual(['item-3']);
  });

  it('carries through titles and ids for a place still awaiting a lookup', () => {
    const { unlocated, titles, ids } = partitionByStoredCoords([
      group('Paris', null, null, ['Napoleon Franc'], ['item-1']),
    ]);
    expect(unlocated).toEqual(['Paris']);
    expect(titles.get('Paris')).toEqual(['Napoleon Franc']);
    expect(ids.get('Paris')).toEqual(['item-1']);
  });
});

describe('withTitles', () => {
  it('puts a located place back together with its entries', () => {
    expect(
      withTitles(cologne, new Map([['Cologne', ['Seated Dime']]])),
    ).toEqual({ ...cologne, titles: ['Seated Dime'] });
  });

  it('gives a place with no entries an empty list, not a missing one', () => {
    expect(withTitles(cologne, new Map())).toEqual({
      ...cologne,
      titles: [],
    });
  });

  it('matches on the place’s own name, not on some other entry', () => {
    expect(
      withTitles(cologne, new Map([['Berlin', ['Buffalo Nickel']]])).titles,
    ).toEqual([]);
  });

  it('leaves the coordinates exactly as they were', () => {
    const place = withTitles(berlin, new Map([['Berlin', ['A coin']]]));
    expect(place.name).toBe('Berlin');
    expect(place.lat).toBe(52.52);
    expect(place.lng).toBe(13.4);
  });
});

describe('partitionByCache', () => {
  it('returns cache hits as places and misses as names to look up', () => {
    const { cached, pending } = partitionByCache(
      ['Cologne', 'Paris', 'Berlin'],
      { Cologne: cologne, Berlin: berlin },
    );
    expect(cached).toEqual([cologne, berlin]);
    expect(pending).toEqual(['Paris']);
  });

  it('preserves input order within each side of the split', () => {
    const { cached, pending } = partitionByCache(
      ['Berlin', 'Paris', 'Cologne', 'Rome'],
      { Cologne: cologne, Berlin: berlin },
    );
    expect(cached).toEqual([berlin, cologne]);
    expect(pending).toEqual(['Paris', 'Rome']);
  });

  it('treats an empty cache as all pending', () => {
    expect(partitionByCache(['Paris'], {})).toEqual({
      cached: [],
      pending: ['Paris'],
    });
  });

  it('has nothing to do for an empty place list', () => {
    expect(partitionByCache([], { Cologne: cologne })).toEqual({
      cached: [],
      pending: [],
    });
  });
});

describe('placeFromPhotonResponse', () => {
  it('reads GeoJSON lng-first coordinates into lat/lng', () => {
    expect(placeFromPhotonResponse('Cologne', photon([6.96, 50.94]))).toEqual({
      name: 'Cologne',
      lat: 50.94,
      lng: 6.96,
    });
  });

  it('keeps the requested name rather than anything from the response', () => {
    expect(placeFromPhotonResponse('My Attic', photon([1, 2]))?.name).toBe(
      'My Attic',
    );
  });

  it('returns null when the query matched nothing', () => {
    expect(placeFromPhotonResponse('Nowhere', { features: [] })).toBeNull();
  });

  it('returns null for a response with no features at all', () => {
    expect(placeFromPhotonResponse('Nowhere', {})).toBeNull();
    expect(placeFromPhotonResponse('Nowhere', null)).toBeNull();
  });

  it('returns null for a malformed geometry instead of producing NaN pins', () => {
    expect(placeFromPhotonResponse('Broken', photon([6.96]))).toBeNull();
    expect(placeFromPhotonResponse('Broken', photon(undefined))).toBeNull();
    expect(placeFromPhotonResponse('Broken', photon(['6.96', '50.94']))).toBe(
      null,
    );
  });

  // A pair with one usable side is the dangerous shape: a check needing both wrong would pin at NaN.
  it('returns null when only one of the two coordinates is a number', () => {
    expect(placeFromPhotonResponse('Half', photon([6.96, '50.94']))).toBeNull();
    expect(placeFromPhotonResponse('Half', photon(['6.96', 50.94]))).toBeNull();
    expect(placeFromPhotonResponse('Half', photon([6.96, null]))).toBeNull();
  });

  // A GeoJSON feature need not carry a geometry; reaching through one would throw inside a worker.
  it('returns null for a feature with nothing to read', () => {
    expect(placeFromPhotonResponse('Odd', { features: [null] })).toBeNull();
    expect(placeFromPhotonResponse('Odd', { features: [{}] })).toBeNull();
    expect(
      placeFromPhotonResponse('Odd', { features: [{ geometry: {} }] }),
    ).toBeNull();
  });
});
