import { describe, expect, it } from 'vitest';

import {
  isRetryableStatus,
  partitionByCache,
  placeFromPhotonResponse,
} from './usePlaces';
import type { Place } from './types';

const cologne: Place = { name: 'Cologne', lat: 50.94, lng: 6.96 };
const berlin: Place = { name: 'Berlin', lat: 52.52, lng: 13.4 };

function photon(coordinates: unknown) {
  return { features: [{ geometry: { coordinates } }] };
}

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
