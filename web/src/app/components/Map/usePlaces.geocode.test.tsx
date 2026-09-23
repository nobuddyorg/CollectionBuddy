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

describe('usePlaces geocoding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(updateItemsPlace).mockResolvedValue({ error: null });
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('geocodes an unlocated place, adds it, caches it, and writes the coords back to its rows', async () => {
    vi.mocked(listCategoryPlaces).mockResolvedValue({
      data: [group('Cologne', null, null, ['Entry A'], ['row-1', 'row-2'])],
      error: null,
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(photonOk([6.96, 50.94])));

    const { result } = renderHook(() =>
      usePlaces({ categoryId: 'cat-1', search: '', enabled: true }),
    );
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.places).toEqual([
      { name: 'Cologne', lat: 50.94, lng: 6.96, titles: ['Entry A'] },
    ]);
    expect(result.current.error).toBe(false);
    expect(updateItemsPlace).toHaveBeenCalledWith({
      ids: ['row-1', 'row-2'],
      payload: { place_lat: 50.94, place_lng: 6.96 },
    });
    const cached = JSON.parse(
      localStorage.getItem('cb_geocode_cache_v1') ?? '{}',
    ) as Record<string, unknown>;
    expect(cached.Cologne).toEqual({ name: 'Cologne', lat: 50.94, lng: 6.96 });
  });

  it('gives up on a place immediately for a non-retryable failure, without retrying', async () => {
    vi.mocked(listCategoryPlaces).mockResolvedValue({
      data: [group('Nowhereville', null, null)],
      error: null,
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 404, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() =>
      usePlaces({ categoryId: 'cat-1', search: '', enabled: true }),
    );
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current.places).toEqual([]);
    // The only place failed outright: "geocoding is broken", not "nothing to show".
    expect(result.current.error).toBe(true);
    expect(updateItemsPlace).not.toHaveBeenCalled();
  });

  it('retries a retryable failure with backoff, then succeeds on a later attempt', async () => {
    vi.useFakeTimers();
    vi.mocked(listCategoryPlaces).mockResolvedValue({
      data: [group('Cologne', null, null)],
      error: null,
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        json: async () => ({}),
      })
      .mockResolvedValueOnce(photonOk([6.96, 50.94]));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() =>
      usePlaces({ categoryId: 'cat-1', search: '', enabled: true }),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.current.places).toEqual([
      { name: 'Cologne', lat: 50.94, lng: 6.96, titles: ['An entry'] },
    ]);
    expect(result.current.error).toBe(false);
  });

  it('gives up after exhausting every retry attempt on a persistently retryable failure', async () => {
    vi.useFakeTimers();
    vi.mocked(listCategoryPlaces).mockResolvedValue({
      data: [group('Cologne', null, null)],
      error: null,
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 503, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() =>
      usePlaces({ categoryId: 'cat-1', search: '', enabled: true }),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.current.places).toEqual([]);
    expect(result.current.error).toBe(true);
  });

  it('treats a network error the same as a retryable failure', async () => {
    vi.useFakeTimers();
    vi.mocked(listCategoryPlaces).mockResolvedValue({
      data: [group('Cologne', null, null)],
      error: null,
    });
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('network down'))
      .mockResolvedValueOnce(photonOk([6.96, 50.94]));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() =>
      usePlaces({ categoryId: 'cat-1', search: '', enabled: true }),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.current.places).toEqual([
      { name: 'Cologne', lat: 50.94, lng: 6.96, titles: ['An entry'] },
    ]);
  });

  it('mixes already-known and freshly-geocoded places without one blocking the other', async () => {
    vi.mocked(listCategoryPlaces).mockResolvedValue({
      data: [
        group('Cologne', 50.94, 6.96, ['Known entry']),
        group('Berlin', null, null, ['New entry']),
      ],
      error: null,
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(photonOk([13.4, 52.52])));

    const { result } = renderHook(() =>
      usePlaces({ categoryId: 'cat-1', search: '', enabled: true }),
    );
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.places).toContainEqual({
      name: 'Cologne',
      lat: 50.94,
      lng: 6.96,
      titles: ['Known entry'],
    });
    expect(result.current.places).toContainEqual({
      name: 'Berlin',
      lat: 52.52,
      lng: 13.4,
      titles: ['New entry'],
    });
    // One known plus one geocoded: `resolvedCount += 1` reaches 2, where a `-= 1` typo lands on 0 and errors.
    expect(result.current.error).toBe(false);
  });

  it('does not report an error when at least one place resolved, even if another never did', async () => {
    vi.mocked(listCategoryPlaces).mockResolvedValue({
      data: [
        group('Cologne', 50.94, 6.96, ['Known entry']),
        group('Nowhereville', null, null),
      ],
      error: null,
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({}),
      }),
    );

    const { result } = renderHook(() =>
      usePlaces({ categoryId: 'cat-1', search: '', enabled: true }),
    );
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.error).toBe(false);
    expect(result.current.places).toEqual([
      { name: 'Cologne', lat: 50.94, lng: 6.96, titles: ['Known entry'] },
    ]);
  });

  it('caps concurrent geocode lookups at the configured limit rather than firing every request at once', async () => {
    vi.mocked(listCategoryPlaces).mockResolvedValue({
      data: [
        group('Place1', null, null, ['A'], ['id-1']),
        group('Place2', null, null, ['B'], ['id-2']),
        group('Place3', null, null, ['C'], ['id-3']),
        group('Place4', null, null, ['D'], ['id-4']),
        group('Place5', null, null, ['E'], ['id-5']),
      ],
      error: null,
    });
    const fetchMock = vi.fn(() => new Promise(() => {}));
    vi.stubGlobal('fetch', fetchMock);

    renderHook(() =>
      usePlaces({ categoryId: 'cat-1', search: '', enabled: true }),
    );
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('asks Photon for exactly one result in the resolved language', async () => {
    vi.mocked(listCategoryPlaces).mockResolvedValue({
      data: [group('Cologne', null, null)],
      error: null,
    });
    const fetchMock = vi.fn().mockResolvedValue(photonOk([6.96, 50.94]));
    vi.stubGlobal('fetch', fetchMock);

    renderHook(() =>
      usePlaces({
        categoryId: 'cat-1',
        search: '',
        enabled: true,
        locale: 'de',
      }),
    );
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(url.searchParams.get('limit')).toBe('1');
    expect(url.searchParams.get('lang')).toBe('de');
  });

  it('waits out the backoff delay before retrying, rather than retrying immediately', async () => {
    vi.useFakeTimers();
    vi.mocked(listCategoryPlaces).mockResolvedValue({
      data: [group('Cologne', null, null)],
      error: null,
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        json: async () => ({}),
      })
      .mockResolvedValueOnce(photonOk([6.96, 50.94]));
    vi.stubGlobal('fetch', fetchMock);

    renderHook(() =>
      usePlaces({ categoryId: 'cat-1', search: '', enabled: true }),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(499);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
