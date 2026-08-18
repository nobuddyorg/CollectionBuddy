import { describe, expect, it } from 'vitest';

import {
  coordsFromFeature,
  isRetryableStatus,
  photonLang,
  photonSearchUrl,
} from './photon';

describe('photonLang', () => {
  it('maps German to de', () => {
    expect(photonLang('de')).toBe('de');
  });

  it('falls back to English for anything else, including nothing', () => {
    expect(photonLang('en')).toBe('en');
    expect(photonLang('fr')).toBe('en');
    expect(photonLang(undefined)).toBe('en');
  });
});

describe('photonSearchUrl', () => {
  it('builds the endpoint with the query and limit', () => {
    const url = new URL(photonSearchUrl('Cologne', { limit: 5 }));
    expect(url.origin + url.pathname).toBe('https://photon.komoot.io/api/');
    expect(url.searchParams.get('q')).toBe('Cologne');
    expect(url.searchParams.get('limit')).toBe('5');
  });

  it('omits the lang param rather than sending an empty one', () => {
    const url = new URL(photonSearchUrl('Cologne', { limit: 1 }));
    expect(url.searchParams.has('lang')).toBe(false);
  });

  it('includes lang when given', () => {
    const url = new URL(photonSearchUrl('Cologne', { limit: 1, lang: 'de' }));
    expect(url.searchParams.get('lang')).toBe('de');
  });
});

describe('coordsFromFeature', () => {
  // These shapes stand in for a third-party response the type forbids but
  // the network can still deliver.
  const withGeometry = (coordinates: unknown) => ({
    geometry: { coordinates },
  });

  it('reads GeoJSON lng-first coordinates into lat/lng', () => {
    expect(coordsFromFeature(withGeometry([6.96, 50.94]))).toEqual({
      lat: 50.94,
      lng: 6.96,
    });
  });

  it('keeps zero coordinates rather than reading them as absent', () => {
    expect(coordsFromFeature(withGeometry([0, 0]))).toEqual({ lat: 0, lng: 0 });
  });

  it('returns null for a suggestion carrying no usable geometry', () => {
    expect(coordsFromFeature(withGeometry(undefined))).toBeNull();
    expect(coordsFromFeature(withGeometry([6.96]))).toBeNull();
    expect(coordsFromFeature({})).toBeNull();
    expect(coordsFromFeature(null)).toBeNull();
  });

  it('returns null rather than storing a coordinate that is not a number', () => {
    expect(coordsFromFeature(withGeometry(['6.96', '50.94']))).toBeNull();
    expect(coordsFromFeature(withGeometry([6.96, NaN]))).toBeNull();
    expect(coordsFromFeature(withGeometry([Infinity, 50.94]))).toBeNull();
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
