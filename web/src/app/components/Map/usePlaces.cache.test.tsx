// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { usePlaces } from './usePlaces';
import { listCategoryPlaces, updateItemsPlace } from '../../data/items';
import type { PlaceGroupRow } from '../../data/items';

vi.mock('../../data/items', () => ({
  listCategoryPlaces: vi.fn(),
  updateItemsPlace: vi.fn(),
}));

function group(
  place: string,
  place_lat: number | null = null,
  place_lng: number | null = null,
  titles: string[] = ['An entry'],
  ids: string[] = ['row-id'],
): PlaceGroupRow {
  return { place, place_lat, place_lng, titles, ids };
}

function photonOk(coordinates: [number, number]) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ features: [{ geometry: { coordinates } }] }),
  };
}

describe('usePlaces geocode cache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(updateItemsPlace).mockResolvedValue({ error: null });
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('serves a cached geocode without ever calling fetch', async () => {
    localStorage.setItem(
      'cb_geocode_cache_v1',
      JSON.stringify({ Berlin: { name: 'Berlin', lat: 52.52, lng: 13.4 } }),
    );
    vi.mocked(listCategoryPlaces).mockResolvedValue({
      data: [group('Berlin', null, null, ['Entry B'])],
      error: null,
    });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => usePlaces('cat-1', '', true));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.places).toEqual([
      { name: 'Berlin', lat: 52.52, lng: 13.4, titles: ['Entry B'] },
    ]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reads a corrupted cache as empty rather than throwing', async () => {
    localStorage.setItem('cb_geocode_cache_v1', 'not json at all {');
    vi.mocked(listCategoryPlaces).mockResolvedValue({
      data: [group('Cologne', null, null)],
      error: null,
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(photonOk([6.96, 50.94])));

    const { result } = renderHook(() => usePlaces('cat-1', '', true));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.places).toEqual([
      { name: 'Cologne', lat: 50.94, lng: 6.96, titles: ['An entry'] },
    ]);
  });

  it('tolerates a cache write failure (e.g. quota exceeded) without losing the result', async () => {
    const setItemSpy = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new DOMException('Quota exceeded', 'QuotaExceededError');
      });
    vi.mocked(listCategoryPlaces).mockResolvedValue({
      data: [group('Cologne', null, null)],
      error: null,
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(photonOk([6.96, 50.94])));

    const { result } = renderHook(() => usePlaces('cat-1', '', true));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.places).toEqual([
      { name: 'Cologne', lat: 50.94, lng: 6.96, titles: ['An entry'] },
    ]);
    setItemSpy.mockRestore();
  });

  it('never touches the geocode cache on disk when nothing needed a fresh lookup', async () => {
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
    vi.mocked(listCategoryPlaces).mockResolvedValue({
      data: [group('Cologne', 50.94, 6.96)],
      error: null,
    });

    renderHook(() => usePlaces('cat-1', '', true));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(setItemSpy).not.toHaveBeenCalled();
    setItemSpy.mockRestore();
  });
});
