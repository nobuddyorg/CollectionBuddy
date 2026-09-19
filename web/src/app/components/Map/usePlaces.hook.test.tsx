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

describe('usePlaces', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(updateItemsPlace).mockResolvedValue({ error: null });
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('does nothing while disabled, leaving the initial loading/error state untouched', async () => {
    const { result } = renderHook(() => usePlaces('cat-1', '', false));
    await act(async () => {
      await Promise.resolve();
    });

    expect(listCategoryPlaces).not.toHaveBeenCalled();
    expect(result.current.places).toEqual([]);
    expect(result.current.loading).toBe(true);
    expect(result.current.error).toBe(false);
  });

  it('draws already-located places immediately, with no geocoding needed', async () => {
    vi.mocked(listCategoryPlaces).mockResolvedValue({
      data: [group('Cologne', 50.94, 6.96, ['Entry A'])],
      error: null,
    });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => usePlaces('cat-1', '', true));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.places).toEqual([
      { name: 'Cologne', lat: 50.94, lng: 6.96, titles: ['Entry A'] },
    ]);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports an error and clears places when the listing itself fails', async () => {
    vi.mocked(listCategoryPlaces).mockResolvedValue({
      data: null,
      error: new Error('offline'),
    });

    const { result } = renderHook(() => usePlaces('cat-1', '', true));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.error).toBe(true);
    expect(result.current.places).toEqual([]);
    expect(result.current.loading).toBe(false);
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

  it('geocodes an unlocated place, adds it, caches it, and writes the coords back to its rows', async () => {
    vi.mocked(listCategoryPlaces).mockResolvedValue({
      data: [group('Cologne', null, null, ['Entry A'], ['row-1', 'row-2'])],
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
      { name: 'Cologne', lat: 50.94, lng: 6.96, titles: ['Entry A'] },
    ]);
    expect(result.current.error).toBe(false);
    expect(updateItemsPlace).toHaveBeenCalledWith(['row-1', 'row-2'], {
      place_lat: 50.94,
      place_lng: 6.96,
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

    const { result } = renderHook(() => usePlaces('cat-1', '', true));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current.places).toEqual([]);
    // The only place failed outright -- distinguish "geocoding is broken"
    // from "nothing to show".
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

    const { result } = renderHook(() => usePlaces('cat-1', '', true));
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

    const { result } = renderHook(() => usePlaces('cat-1', '', true));
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

    const { result } = renderHook(() => usePlaces('cat-1', '', true));
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

    const { result } = renderHook(() => usePlaces('cat-1', '', true));
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
    // One already-known place plus one freshly-geocoded success resolves
    // every place there is -- this is the case that tells `resolvedCount`'s
    // `+= 1` apart from a `-= 1` typo: both start it at the known count (1),
    // but only `+=` reaches 2 (not zero) once the geocode also lands, while
    // `-=` would land back on exactly 0 and wrongly report an error here.
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

    const { result } = renderHook(() => usePlaces('cat-1', '', true));
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

  it('aborts the listing fetch on unmount, before it has a chance to resolve', async () => {
    let capturedSignal: AbortSignal | undefined;
    vi.mocked(listCategoryPlaces).mockImplementation(
      (_categoryId, _search, signal) =>
        new Promise(() => {
          capturedSignal = signal;
          // Never resolves -- only the abort matters for this test.
        }),
    );

    const { unmount } = renderHook(() => usePlaces('cat-1', '', true));
    await act(async () => {
      await Promise.resolve();
    });

    unmount();

    expect(capturedSignal?.aborted).toBe(true);
  });

  // `cancelled` guards the UI-facing `setPlaces` call, but not the
  // fire-and-forget `updateItemsPlace` write-back just below it: a place
  // resolved after the map moved on is still worth persisting, so the next
  // lookup doesn't have to geocode it again.
  it('still writes a late-resolving geocode back to its rows after being cancelled, even though the UI has moved on', async () => {
    vi.mocked(listCategoryPlaces).mockResolvedValue({
      data: [group('Cologne', null, null)],
      error: null,
    });
    let resolveFetch!: (v: unknown) => void;
    const fetchMock = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const { unmount } = renderHook(() => usePlaces('cat-1', '', true));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    unmount();
    await act(async () => {
      resolveFetch(photonOk([6.96, 50.94]));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(updateItemsPlace).toHaveBeenCalledWith(['row-id'], {
      place_lat: 50.94,
      place_lng: 6.96,
    });
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

  it('re-fetches when the category, search, or enabled flag changes', async () => {
    vi.mocked(listCategoryPlaces).mockResolvedValue({
      data: [group('Cologne', 50.94, 6.96)],
      error: null,
    });

    const { rerender } = renderHook(
      ({ categoryId, search }: { categoryId: string; search: string }) =>
        usePlaces(categoryId, search, true),
      { initialProps: { categoryId: 'cat-1', search: '' } },
    );
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(listCategoryPlaces).toHaveBeenCalledTimes(1);

    rerender({ categoryId: 'cat-1', search: 'Col' });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(listCategoryPlaces).toHaveBeenCalledTimes(2);
    expect(listCategoryPlaces).toHaveBeenLastCalledWith(
      'cat-1',
      'Col',
      expect.anything(),
    );
  });

  it('sets loading back to true for a later fetch, not only the first one', async () => {
    vi.mocked(listCategoryPlaces).mockResolvedValueOnce({
      data: [group('Cologne', 50.94, 6.96)],
      error: null,
    });

    const { result, rerender } = renderHook(
      ({ categoryId }: { categoryId: string }) =>
        usePlaces(categoryId, '', true),
      { initialProps: { categoryId: 'cat-1' } },
    );
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.loading).toBe(false);

    vi.mocked(listCategoryPlaces).mockImplementationOnce(
      () => new Promise(() => {}),
    );
    rerender({ categoryId: 'cat-2' });

    expect(result.current.loading).toBe(true);
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

  it('ignores an already-known batch delivered by a request superseded before it resolved', async () => {
    let resolveFirst!: (v: {
      data: PlaceGroupRow[] | null;
      error: unknown;
    }) => void;
    vi.mocked(listCategoryPlaces)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockResolvedValueOnce({
        data: [group('Berlin', 52.52, 13.4, ['Berlin entry'])],
        error: null,
      });

    const { result, rerender } = renderHook(
      ({ categoryId }: { categoryId: string }) =>
        usePlaces(categoryId, '', true),
      { initialProps: { categoryId: 'cat-1' } },
    );

    rerender({ categoryId: 'cat-2' });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.places).toEqual([
      { name: 'Berlin', lat: 52.52, lng: 13.4, titles: ['Berlin entry'] },
    ]);

    resolveFirst({
      data: [group('Cologne', 50.94, 6.96, ['Cologne entry'])],
      error: null,
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.places).toEqual([
      { name: 'Berlin', lat: 52.52, lng: 13.4, titles: ['Berlin entry'] },
    ]);
  });

  it('ignores a freshly-geocoded place delivered after the category already changed', async () => {
    let resolveFetch!: (v: unknown) => void;
    vi.mocked(listCategoryPlaces)
      .mockResolvedValueOnce({
        data: [group('Cologne', null, null, ['Cologne entry'])],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [group('Berlin', 52.52, 13.4, ['Berlin entry'])],
        error: null,
      });
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise((resolve) => {
            resolveFetch = resolve;
          }),
      ),
    );

    const { result, rerender } = renderHook(
      ({ categoryId }: { categoryId: string }) =>
        usePlaces(categoryId, '', true),
      { initialProps: { categoryId: 'cat-1' } },
    );
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    rerender({ categoryId: 'cat-2' });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.places).toEqual([
      { name: 'Berlin', lat: 52.52, lng: 13.4, titles: ['Berlin entry'] },
    ]);

    resolveFetch(photonOk([6.96, 50.94]));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.places).toEqual([
      { name: 'Berlin', lat: 52.52, lng: 13.4, titles: ['Berlin entry'] },
    ]);
  });

  it('does not report an error for a listing that fails after the category already changed', async () => {
    let rejectFirst!: (e: unknown) => void;
    vi.mocked(listCategoryPlaces)
      .mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) => {
            rejectFirst = reject;
          }),
      )
      .mockResolvedValueOnce({
        data: [group('Berlin', 52.52, 13.4, ['Berlin entry'])],
        error: null,
      });

    const { result, rerender } = renderHook(
      ({ categoryId }: { categoryId: string }) =>
        usePlaces(categoryId, '', true),
      { initialProps: { categoryId: 'cat-1' } },
    );

    rerender({ categoryId: 'cat-2' });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.places).toEqual([
      { name: 'Berlin', lat: 52.52, lng: 13.4, titles: ['Berlin entry'] },
    ]);
    expect(result.current.loading).toBe(false);

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    rejectFirst(new Error('stale failure'));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.places).toEqual([
      { name: 'Berlin', lat: 52.52, lng: 13.4, titles: ['Berlin entry'] },
    ]);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe(false);
    consoleSpy.mockRestore();
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

    renderHook(() => usePlaces('cat-1', '', true));
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

    renderHook(() => usePlaces('cat-1', '', true, 'de'));
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

    renderHook(() => usePlaces('cat-1', '', true));
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

  it('logs the underlying reason when the listing itself fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const listingError = new Error('offline');
    vi.mocked(listCategoryPlaces).mockResolvedValue({
      data: null,
      error: listingError,
    });

    renderHook(() => usePlaces('cat-1', '', true));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(consoleSpy).toHaveBeenCalledWith(
      'Failed to load places:',
      expect.objectContaining({
        message: 'Could not list places',
        cause: listingError,
      }),
    );
    consoleSpy.mockRestore();
  });

  it('reports no error when there is nothing at all to plot', async () => {
    vi.mocked(listCategoryPlaces).mockResolvedValue({ data: [], error: null });

    const { result } = renderHook(() => usePlaces('cat-1', '', true));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.error).toBe(false);
    expect(result.current.places).toEqual([]);
  });

  it('treats a null places listing the same as an empty one', async () => {
    vi.mocked(listCategoryPlaces).mockResolvedValue({
      data: null,
      error: null,
    });

    const { result } = renderHook(() => usePlaces('cat-1', '', true));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.places).toEqual([]);
    expect(result.current.error).toBe(false);
  });

  it('does not clear loading for a request superseded before it settled', async () => {
    let resolveFirst!: (v: {
      data: PlaceGroupRow[] | null;
      error: unknown;
    }) => void;
    vi.mocked(listCategoryPlaces)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockImplementationOnce(() => new Promise(() => {}));

    const { result, rerender } = renderHook(
      ({ categoryId }: { categoryId: string }) =>
        usePlaces(categoryId, '', true),
      { initialProps: { categoryId: 'cat-1' } },
    );

    rerender({ categoryId: 'cat-2' });
    expect(result.current.loading).toBe(true);

    resolveFirst({ data: [], error: null });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.loading).toBe(true);
  });

  it('stops retrying once cancelled during the backoff wait, instead of ignoring the cancellation', async () => {
    vi.useFakeTimers();
    vi.mocked(listCategoryPlaces)
      .mockResolvedValueOnce({
        data: [group('Cologne', null, null)],
        error: null,
      })
      .mockImplementationOnce(() => new Promise(() => {}));
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 429, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);

    const { rerender } = renderHook(
      ({ categoryId }: { categoryId: string }) =>
        usePlaces(categoryId, '', true),
      { initialProps: { categoryId: 'cat-1' } },
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    rerender({ categoryId: 'cat-2' });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  // With nothing already known (nothing located, nothing cached), `known` is
  // `[]` -- setting `places` to it would be a no-op value-wise, since the
  // unconditional `setPlaces([])` a few lines up already put it there. The
  // `> 0` guard exists purely to skip that redundant, but harmless, second
  // render; a mutant widening it to `>= 0` cannot be told apart by the
  // resulting *value* of `places` (`[]` either way), only by counting
  // renders, which is exactly what this test does.
  it('does not re-render for an empty already-known batch before geocoding starts', async () => {
    vi.mocked(listCategoryPlaces).mockResolvedValue({
      data: [group('Cologne', null, null)],
      error: null,
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {})),
    );

    let renderCount = 0;
    renderHook(() => {
      renderCount += 1;
      return usePlaces('cat-1', '', true);
    });
    const countAfterMount = renderCount;

    await act(async () => {
      await Promise.resolve();
    });

    expect(renderCount).toBe(countAfterMount);
  });
});
