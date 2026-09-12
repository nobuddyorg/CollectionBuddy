// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { listItemPlaces, updateItem } from '../../data/items';
import { usePlaces } from './usePlaces';

vi.mock('../../data/items', () => ({
  listItemPlaces: vi.fn(),
  updateItem: vi.fn(),
}));

const GEOCODE_CACHE_KEY = 'cb_geocode_cache_v1';

function itemRow(
  id: string,
  place: string | null,
  lat: number | null = null,
  lng: number | null = null,
) {
  return { id, title: `Item ${id}`, place, place_lat: lat, place_lng: lng };
}

function listed(rows: ReturnType<typeof itemRow>[]) {
  vi.mocked(listItemPlaces).mockResolvedValue({
    data: rows,
    error: null,
  });
}

function photonHit(lng: number, lat: number) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      features: [{ geometry: { coordinates: [lng, lat] } }],
    }),
  } as unknown as Response;
}

function photonStatus(status: number) {
  return { ok: false, status } as unknown as Response;
}

describe('usePlaces', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    vi.mocked(updateItem).mockResolvedValue({ error: null } as never);
    listed([]);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('asks for nothing until the map is open', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    renderHook(() => usePlaces('cat-1', '', false));

    expect(listItemPlaces).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('draws a stored coordinate pair without asking the gazetteer', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    listed([itemRow('a', 'Bonn', 50.7, 7.1)]);

    const { result } = renderHook(() => usePlaces('cat-1', '', true));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.places).toEqual([
      { name: 'Bonn', lat: 50.7, lng: 7.1, titles: ['Item a'] },
    ]);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.current.error).toBe(false);
  });

  it('geocodes a place with no coordinates and writes the answer back to its entries', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => photonHit(7.1, 50.7)),
    );
    listed([itemRow('a', 'Bonn'), itemRow('b', 'Bonn')]);

    const { result } = renderHook(() => usePlaces('cat-1', '', true));

    await waitFor(() => expect(result.current.places).toHaveLength(1));
    expect(result.current.places[0]).toEqual({
      name: 'Bonn',
      lat: 50.7,
      lng: 7.1,
      titles: ['Item a', 'Item b'],
    });
    // Both rows at that place, so the next open reads the coordinates
    // instead of asking again.
    expect(updateItem).toHaveBeenCalledWith('a', {
      place_lat: 50.7,
      place_lng: 7.1,
    });
    expect(updateItem).toHaveBeenCalledWith('b', {
      place_lat: 50.7,
      place_lng: 7.1,
    });
  });

  it('remembers a geocoded place for the next time the map opens', async () => {
    const fetchSpy = vi.fn(async () => photonHit(7.1, 50.7));
    vi.stubGlobal('fetch', fetchSpy);
    listed([itemRow('a', 'Bonn')]);

    const first = renderHook(() => usePlaces('cat-1', '', true));
    await waitFor(() => expect(first.result.current.places).toHaveLength(1));
    expect(JSON.parse(localStorage.getItem(GEOCODE_CACHE_KEY) ?? '{}')).toEqual(
      { Bonn: { name: 'Bonn', lat: 50.7, lng: 7.1 } },
    );

    fetchSpy.mockClear();
    const second = renderHook(() => usePlaces('cat-1', '', true));

    await waitFor(() => expect(second.result.current.places).toHaveLength(1));
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // "Geocoding is broken" and "there is nothing to show" look the same on
  // the map, so only the first raises the error the map reports.
  it('reports an error when every place fails to resolve', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => photonStatus(429)),
    );
    listed([itemRow('a', 'Nowhere')]);

    const { result } = renderHook(() => usePlaces('cat-1', '', true));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });

    expect(result.current.error).toBe(true);
    expect(result.current.places).toEqual([]);
  });

  it('reports no error when there was nothing to place', async () => {
    listed([itemRow('a', null)]);

    const { result } = renderHook(() => usePlaces('cat-1', '', true));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe(false);
  });

  it('gives up on a place the gazetteer does not know, without retrying', async () => {
    const fetchSpy = vi.fn(async () => photonStatus(404));
    vi.stubGlobal('fetch', fetchSpy);
    listed([itemRow('a', 'Atlantis')]);

    const { result } = renderHook(() => usePlaces('cat-1', '', true));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(result.current.places).toEqual([]);
  });

  it('retries a refused lookup and keeps the pin it eventually gets', async () => {
    vi.useFakeTimers();
    const fetchSpy = vi
      .fn<() => Promise<Response>>()
      .mockResolvedValueOnce(photonStatus(503))
      .mockResolvedValue(photonHit(7.1, 50.7));
    vi.stubGlobal('fetch', fetchSpy);
    listed([itemRow('a', 'Bonn')]);

    const { result } = renderHook(() => usePlaces('cat-1', '', true));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(result.current.places).toHaveLength(1);
  });

  it('retries a connection that fails outright', async () => {
    vi.useFakeTimers();
    const fetchSpy = vi
      .fn<() => Promise<Response>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(photonHit(7.1, 50.7));
    vi.stubGlobal('fetch', fetchSpy);
    listed([itemRow('a', 'Bonn')]);

    const { result } = renderHook(() => usePlaces('cat-1', '', true));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(result.current.places).toHaveLength(1);
  });

  it('reports a failed listing as an error rather than an empty map', async () => {
    vi.mocked(listItemPlaces).mockResolvedValue({
      data: null,
      error: new Error('rls'),
    });

    const { result } = renderHook(() => usePlaces('cat-1', '', true));

    await waitFor(() => expect(result.current.error).toBe(true));
    expect(result.current.places).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it('abandons a lookup the search has superseded', async () => {
    let signal: AbortSignal | undefined;
    vi.mocked(listItemPlaces).mockImplementation(
      async (_categoryId: string, _search: string, sig?: AbortSignal) => {
        signal = sig;
        return { data: [itemRow('a', 'Bonn')], error: null };
      },
    );
    const { unmount } = renderHook(() => usePlaces('cat-1', '', true));
    await waitFor(() => expect(signal).toBeDefined());

    unmount();

    expect(signal?.aborted).toBe(true);
  });

  it('carries on when the cache cannot be read or written', async () => {
    const getItem = vi
      .spyOn(Storage.prototype, 'getItem')
      .mockImplementation(() => {
        throw new Error('blocked');
      });
    const setItem = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new Error('blocked');
      });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => photonHit(7.1, 50.7)),
    );
    listed([itemRow('a', 'Bonn')]);

    const { result } = renderHook(() => usePlaces('cat-1', '', true));

    await waitFor(() => expect(result.current.places).toHaveLength(1));
    getItem.mockRestore();
    setItem.mockRestore();
  });
});
