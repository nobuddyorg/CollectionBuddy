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

type Listing = { data: PlaceGroupRow[] | null; error: unknown };

const berlin = {
  name: 'Berlin',
  lat: 52.52,
  lng: 13.4,
  titles: ['Berlin entry'],
};

function renderByCategory() {
  return renderHook(
    ({ categoryId }: { categoryId: string }) =>
      usePlaces({ categoryId, search: '', enabled: true }),
    { initialProps: { categoryId: 'cat-1' } },
  );
}

describe('usePlaces cancellation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(updateItemsPlace).mockResolvedValue({ error: null });
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('aborts the listing fetch on unmount, before it has a chance to resolve', async () => {
    let capturedSignal: AbortSignal | undefined;
    vi.mocked(listCategoryPlaces).mockImplementation(
      ({ signal }) =>
        new Promise(() => {
          capturedSignal = signal;
        }),
    );

    const { unmount } = renderHook(() =>
      usePlaces({ categoryId: 'cat-1', search: '', enabled: true }),
    );
    await act(async () => {
      await Promise.resolve();
    });

    unmount();

    expect(capturedSignal?.aborted).toBe(true);
  });

  // `cancelled` guards `setPlaces`, not the write-back: a late geocode is still worth persisting.
  it('still writes a late-resolving geocode back to its rows after being cancelled, even though the UI has moved on', async () => {
    vi.mocked(listCategoryPlaces).mockResolvedValue({
      data: [group('Cologne', null, null)],
      error: null,
    });
    let resolveFetch!: (value: unknown) => void;
    const fetchMock = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const { unmount } = renderHook(() =>
      usePlaces({ categoryId: 'cat-1', search: '', enabled: true }),
    );
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

    expect(updateItemsPlace).toHaveBeenCalledWith({
      ids: ['row-id'],
      payload: { place_lat: 50.94, place_lng: 6.96 },
    });
  });

  it('ignores an already-known batch delivered by a request superseded before it resolved', async () => {
    let resolveFirst!: (listing: Listing) => void;
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

    const { result, rerender } = renderByCategory();

    rerender({ categoryId: 'cat-2' });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.places).toEqual([berlin]);

    resolveFirst({
      data: [group('Cologne', 50.94, 6.96, ['Cologne entry'])],
      error: null,
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.places).toEqual([berlin]);
  });

  it('ignores a freshly-geocoded place delivered after the category already changed', async () => {
    let resolveFetch!: (value: unknown) => void;
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

    const { result, rerender } = renderByCategory();
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    rerender({ categoryId: 'cat-2' });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.places).toEqual([berlin]);

    resolveFetch(photonOk([6.96, 50.94]));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.places).toEqual([berlin]);
  });

  it('does not report an error for a listing that fails after the category already changed', async () => {
    let rejectFirst!: (error: unknown) => void;
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

    const { result, rerender } = renderByCategory();

    rerender({ categoryId: 'cat-2' });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.places).toEqual([berlin]);
    expect(result.current.loading).toBe(false);

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    rejectFirst(new Error('stale failure'));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.places).toEqual([berlin]);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe(false);
    consoleSpy.mockRestore();
  });

  it('does not clear loading for a request superseded before it settled', async () => {
    let resolveFirst!: (listing: Listing) => void;
    vi.mocked(listCategoryPlaces)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockImplementationOnce(() => new Promise(() => {}));

    const { result, rerender } = renderByCategory();

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

    const { rerender } = renderByCategory();
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
});
