// @vitest-environment jsdom
import { act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  installUsePlacesMocks,
  renderUsePlaces,
  restoreGlobalsAndTimers,
} from './usePlaces.hook.test-support';
import { group, photonFailure, photonOk } from './usePlaces.test-support';
import { listCategoryPlaces, updateItemsPlace } from '../../data/items';
import type { PlaceGroupRow } from '../../data/items';

vi.mock('../../data/items', () => ({
  listCategoryPlaces: vi.fn(),
  updateItemsPlace: vi.fn(),
}));

type Listing = { data: PlaceGroupRow[] | null; error: unknown };

const berlin = {
  name: 'Berlin',
  lat: 52.52,
  lng: 13.4,
  titles: ['Berlin entry'],
};

describe('usePlaces cancellation', () => {
  beforeEach(installUsePlacesMocks);

  afterEach(restoreGlobalsAndTimers);

  it('aborts the listing fetch on unmount, before it has a chance to resolve', async () => {
    let capturedSignal: AbortSignal | undefined;
    vi.mocked(listCategoryPlaces).mockImplementation(
      ({ signal }) =>
        new Promise(() => {
          capturedSignal = signal;
        }),
    );

    const { unmount } = renderUsePlaces();
    await act(async () => {
      await Promise.resolve();
    });

    unmount();

    expect(capturedSignal?.aborted).toBe(true);
  });

  it('aborts an in-flight Photon lookup on unmount, and retries nothing after it', async () => {
    vi.useFakeTimers();
    vi.mocked(listCategoryPlaces).mockResolvedValue({
      data: [group('Cologne')],
      error: null,
    });
    const fetchMock = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal!.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          );
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const { unmount } = renderUsePlaces();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    const [, init] = fetchMock.mock.calls[0];
    expect(init.signal!.aborted).toBe(false);

    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });

    expect(init.signal!.aborted).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(updateItemsPlace).not.toHaveBeenCalled();
  });

  // Each place a worker took would claim a paced turn, keeping timers alive for a map nobody sees.
  it('stops walking the queue after unmount, once the turns already claimed have passed', async () => {
    vi.useFakeTimers();
    vi.mocked(listCategoryPlaces).mockResolvedValue({
      data: Array.from({ length: 8 }, (_, index) =>
        group(`Place${index}`, { ids: [`id-${index}`] }),
      ),
      error: null,
    });
    const fetchMock = vi.fn().mockResolvedValue(photonOk([6.96, 50.94]));
    vi.stubGlobal('fetch', fetchMock);

    const { unmount } = renderUsePlaces();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    unmount();
    // Four turns were claimed by then, a third of a second apart; the last one's gap ends at 1,336 ms.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1400);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  // `cancelled` guards `setPlaces`, not the write-back: a late geocode is still worth persisting.
  it('still writes a late-resolving geocode back to its rows after being cancelled, even though the UI has moved on', async () => {
    vi.mocked(listCategoryPlaces).mockResolvedValue({
      data: [group('Cologne')],
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

    const { unmount } = renderUsePlaces();
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
        data: [
          group('Berlin', {
            place_lat: 52.52,
            place_lng: 13.4,
            titles: ['Berlin entry'],
          }),
        ],
        error: null,
      });

    const { result, rerender } = renderUsePlaces();

    rerender({ categoryId: 'cat-2' });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.places).toEqual([berlin]);

    resolveFirst({
      data: [
        group('Cologne', {
          place_lat: 50.94,
          place_lng: 6.96,
          titles: ['Cologne entry'],
        }),
      ],
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
        data: [group('Cologne', { titles: ['Cologne entry'] })],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [
          group('Berlin', {
            place_lat: 52.52,
            place_lng: 13.4,
            titles: ['Berlin entry'],
          }),
        ],
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

    const { result, rerender } = renderUsePlaces();
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
        data: [
          group('Berlin', {
            place_lat: 52.52,
            place_lng: 13.4,
            titles: ['Berlin entry'],
          }),
        ],
        error: null,
      });

    const { result, rerender } = renderUsePlaces();

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

    const { result, rerender } = renderUsePlaces();

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
        data: [group('Cologne')],
        error: null,
      })
      .mockImplementationOnce(() => new Promise(() => {}));
    const fetchMock = vi.fn().mockResolvedValue(photonFailure(429));
    vi.stubGlobal('fetch', fetchMock);

    const { rerender } = renderUsePlaces();
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
