import { describe, expect, it } from 'vitest';

import {
  isRetryableStatus,
  partitionByCache,
  partitionByStoredCoords,
  placeFromPhotonResponse,
} from './usePlaces';
import type { Place } from './types';
import type { ItemPlaceRow } from '../../data/items';

const cologne: Place = { name: 'Cologne', lat: 50.94, lng: 6.96 };
const berlin: Place = { name: 'Berlin', lat: 52.52, lng: 13.4 };

function photon(coordinates: unknown) {
  return { features: [{ geometry: { coordinates } }] };
}

function row(
  place: string | null,
  place_lat: number | null = null,
  place_lng: number | null = null,
): ItemPlaceRow {
  return { place, place_lat, place_lng };
}

describe('partitionByStoredCoords', () => {
  it('draws stored coordinates without a lookup, and lists the rest', () => {
    const { located, unlocated } = partitionByStoredCoords([
      row('Cologne', 50.94, 6.96),
      row('Paris'),
      row('Berlin', 52.52, 13.4),
    ]);
    expect(located).toEqual([cologne, berlin]);
    expect(unlocated).toEqual(['Paris']);
  });

  it('preserves input order within each side of the split', () => {
    const { located, unlocated } = partitionByStoredCoords([
      row('Berlin', 52.52, 13.4),
      row('Paris'),
      row('Cologne', 50.94, 6.96),
      row('Rome'),
    ]);
    expect(located).toEqual([berlin, cologne]);
    expect(unlocated).toEqual(['Paris', 'Rome']);
  });

  it('deduplicates a place repeated across items', () => {
    const { located, unlocated } = partitionByStoredCoords([
      row('Cologne', 50.94, 6.96),
      row('Cologne', 50.94, 6.96),
      row('Paris'),
      row('Paris'),
    ]);
    expect(located).toEqual([cologne]);
    expect(unlocated).toEqual(['Paris']);
  });

  it('spares a place a lookup when any one item located it', () => {
    // An item entered before 0015 alongside one entered after: the older
    // row has no coordinates, but the place is still known.
    const { located, unlocated } = partitionByStoredCoords([
      row('Cologne'),
      row('Cologne', 50.94, 6.96),
    ]);
    expect(located).toEqual([cologne]);
    expect(unlocated).toEqual([]);
  });

  it('falls back to a lookup when only one coordinate was stored', () => {
    expect(partitionByStoredCoords([row('Cologne', 50.94, null)])).toEqual({
      located: [],
      unlocated: ['Cologne'],
    });
    expect(partitionByStoredCoords([row('Cologne', null, 6.96)])).toEqual({
      located: [],
      unlocated: ['Cologne'],
    });
  });

  it('falls back to a lookup rather than pinning a non-finite coordinate', () => {
    expect(partitionByStoredCoords([row('Broken', NaN, 6.96)])).toEqual({
      located: [],
      unlocated: ['Broken'],
    });
    expect(partitionByStoredCoords([row('Broken', 50.94, Infinity)])).toEqual({
      located: [],
      unlocated: ['Broken'],
    });
  });

  it('treats zero coordinates as a real location, not a missing one', () => {
    expect(partitionByStoredCoords([row('Null Island', 0, 0)])).toEqual({
      located: [{ name: 'Null Island', lat: 0, lng: 0 }],
      unlocated: [],
    });
  });

  it('ignores rows with no place at all', () => {
    expect(partitionByStoredCoords([row(null, 50.94, 6.96), row('')])).toEqual({
      located: [],
      unlocated: [],
    });
  });

  it('has nothing to do for an empty row list', () => {
    expect(partitionByStoredCoords([])).toEqual({
      located: [],
      unlocated: [],
    });
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
});

describe('isRetryableStatus', () => {
  it('asks again when the service refused to serve right now', () => {
    expect(isRetryableStatus(429)).toBe(true);
  });

  it('asks again when the service is broken right now', () => {
    expect(isRetryableStatus(500)).toBe(true);
    expect(isRetryableStatus(502)).toBe(true);
    expect(isRetryableStatus(503)).toBe(true);
  });

  it('gives up on an answered request, however unwelcome the answer', () => {
    expect(isRetryableStatus(400)).toBe(false);
    expect(isRetryableStatus(403)).toBe(false);
    expect(isRetryableStatus(404)).toBe(false);
  });
});
