import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  coordsFromFeature,
  coordsFromPhotonResponse,
  photonLang,
  photonSearchUrl,
  searchPhotonFeatures,
  type PhotonFeature,
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

describe('searchPhotonFeatures', () => {
  const cologne: PhotonFeature = {
    properties: { osm_id: 1, city: 'Cologne' },
    geometry: { type: 'Point', coordinates: [6.96, 50.94] },
  };

  function stubFetch(respond: () => Promise<unknown>) {
    const fetchMock = vi
      .fn<(url: string, init: RequestInit) => Promise<unknown>>()
      .mockImplementation(respond);
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  const search = (signal = new AbortController().signal) =>
    searchPhotonFeatures('Col', { limit: 5, lang: 'de', signal });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns the features Photon found for the query, limit and language', async () => {
    const fetchMock = stubFetch(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ features: [cologne] }),
    }));
    const controller = new AbortController();

    const features = await search(controller.signal);

    expect(features).toEqual([cologne]);
    const [url, init] = fetchMock.mock.calls[0];
    const params = new URL(url).searchParams;
    expect(params.get('q')).toBe('Col');
    expect(params.get('limit')).toBe('5');
    expect(params.get('lang')).toBe('de');
    expect(init.signal).toBe(controller.signal);
  });

  it('rejects with the status of a refused request, never reading its body', async () => {
    const json = vi.fn().mockResolvedValue({ features: [cologne] });
    stubFetch(async () => ({ ok: false, status: 503, json }));

    await expect(search()).rejects.toThrow(new Error('HTTP 503'));
    expect(json).not.toHaveBeenCalled();
  });

  it("passes fetch's abort through unchanged, so a superseded search reads as one", async () => {
    const abort = new DOMException('Aborted', 'AbortError');
    stubFetch(async () => {
      throw abort;
    });

    await expect(search()).rejects.toBe(abort);
  });
});

describe('coordsFromFeature', () => {
  // Shapes the type forbids but a third-party response can still deliver.
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

function photon(coordinates: unknown) {
  return { features: [{ geometry: { coordinates } }] };
}

describe('coordsFromPhotonResponse', () => {
  it('reads GeoJSON lng-first coordinates into lat/lng', () => {
    expect(coordsFromPhotonResponse(photon([6.96, 50.94]))).toEqual({
      lat: 50.94,
      lng: 6.96,
    });
  });

  it('returns null when the query matched nothing', () => {
    expect(coordsFromPhotonResponse({ features: [] })).toBeNull();
  });

  it('returns null for a response with no features at all', () => {
    expect(coordsFromPhotonResponse({})).toBeNull();
    expect(coordsFromPhotonResponse(null)).toBeNull();
  });

  it('returns null for a malformed geometry instead of producing NaN pins', () => {
    expect(coordsFromPhotonResponse(photon([6.96]))).toBeNull();
    expect(coordsFromPhotonResponse(photon(undefined))).toBeNull();
    expect(coordsFromPhotonResponse(photon(['6.96', '50.94']))).toBe(null);
  });

  // A pair with one usable side is the dangerous shape: a check needing both wrong would pin at NaN.
  it('returns null when only one of the two coordinates is a number', () => {
    expect(coordsFromPhotonResponse(photon([6.96, '50.94']))).toBeNull();
    expect(coordsFromPhotonResponse(photon(['6.96', 50.94]))).toBeNull();
    expect(coordsFromPhotonResponse(photon([6.96, null]))).toBeNull();
  });

  // A GeoJSON feature need not carry a geometry; reaching through one would throw inside a worker.
  it('returns null for a feature with nothing to read', () => {
    expect(coordsFromPhotonResponse({ features: [null] })).toBeNull();
    expect(coordsFromPhotonResponse({ features: [{}] })).toBeNull();
    expect(
      coordsFromPhotonResponse({ features: [{ geometry: {} }] }),
    ).toBeNull();
  });
});
