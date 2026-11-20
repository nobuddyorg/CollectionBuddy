// @vitest-environment jsdom
import { act, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  installUsePlacesMocks,
  renderUsePlaces,
  restoreGlobalsAndTimers,
} from './usePlaces.hook.test-support';
import { group, photonFailure, photonOk } from './usePlaces.test-support';
import { listCategoryPlaces, updateItemsPlace } from '../../data/items';

vi.mock('../../data/items', () => ({
  listCategoryPlaces: vi.fn(),
  updateItemsPlace: vi.fn(),
}));

describe('usePlaces geocoding', () => {
  beforeEach(installUsePlacesMocks);

  afterEach(restoreGlobalsAndTimers);

  it('geocodes an unlocated place, adds it, and writes the coords back to its rows', async () => {
    vi.mocked(listCategoryPlaces).mockResolvedValue({
      data: [
        group('Cologne', { titles: ['Entry A'], ids: ['row-1', 'row-2'] }),
      ],
      error: null,
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(photonOk([6.96, 50.94])));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { result } = renderUsePlaces();
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
    expect(result.current.unplaced).toBe(0);
    // Stored on the rows, so nothing of it is kept in the browser.
    expect(localStorage.length).toBe(0);
    // A macrotask runs only once every microtask, the write-back's own included, has settled.
    await act(() => new Promise((resolve) => setTimeout(resolve)));
    expect(consoleSpy).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('reports a refused write-back and still pins the place', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const denied = new Error('permission denied');
    vi.mocked(updateItemsPlace).mockResolvedValue({ error: denied });
    vi.mocked(listCategoryPlaces).mockResolvedValue({
      data: [group('Cologne', { titles: ['Entry A'] })],
      error: null,
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(photonOk([6.96, 50.94])));

    const { result } = renderUsePlaces();

    await waitFor(() =>
      expect(consoleSpy).toHaveBeenCalledWith(
        'Could not store a geocoded place:',
        denied,
      ),
    );
    expect(result.current.places).toEqual([
      { name: 'Cologne', lat: 50.94, lng: 6.96, titles: ['Entry A'] },
    ]);
    expect(result.current.error).toBe(false);
    consoleSpy.mockRestore();
  });

  // A viewer cannot store the answer, so asking would send the owner's place names to Photon for nothing kept.
  it('sends nothing to Photon for a viewer, and counts the places it cannot pin', async () => {
    vi.mocked(listCategoryPlaces).mockResolvedValue({
      data: [
        group('Cologne', { titles: ['Entry A'], ids: ['row-1'] }),
        group('Paris', { titles: ['Entry B'], ids: ['row-2'] }),
        group('Bonn', {
          place_lat: 50.74,
          place_lng: 7.1,
          titles: ['Entry C'],
        }),
      ],
      error: null,
    });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderUsePlaces({ canEdit: false });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.places).toEqual([
      { name: 'Bonn', lat: 50.74, lng: 7.1, titles: ['Entry C'] },
    ]);
    expect(result.current.unplaced).toBe(2);
    expect(result.current.error).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(updateItemsPlace).not.toHaveBeenCalled();
  });

  it('reports no error for a viewer whose every place is still unlocated', async () => {
    vi.mocked(listCategoryPlaces).mockResolvedValue({
      data: [group('Cologne')],
      error: null,
    });
    vi.stubGlobal('fetch', vi.fn());

    const { result } = renderUsePlaces({ canEdit: false });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.places).toEqual([]);
    expect(result.current.unplaced).toBe(1);
    expect(result.current.error).toBe(false);
  });

  it('counts a place Photon does not know as one it could not pin', async () => {
    vi.mocked(listCategoryPlaces).mockResolvedValue({
      data: [
        group('Entenhausen'),
        group('Bonn', { place_lat: 50.74, place_lng: 7.1 }),
      ],
      error: null,
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ features: [] }),
      }),
    );

    const { result } = renderUsePlaces();
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.unplaced).toBe(1);
    expect(result.current.error).toBe(false);
  });

  it('gives up on a place immediately for a non-retryable failure, without retrying', async () => {
    vi.mocked(listCategoryPlaces).mockResolvedValue({
      data: [group('Nowhereville')],
      error: null,
    });
    const fetchMock = vi.fn().mockResolvedValue(photonFailure(404));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderUsePlaces();
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
      data: [group('Cologne')],
      error: null,
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(photonFailure(429))
      .mockResolvedValueOnce(photonOk([6.96, 50.94]));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderUsePlaces();
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
      data: [group('Cologne')],
      error: null,
    });
    const fetchMock = vi.fn().mockResolvedValue(photonFailure(503));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderUsePlaces();
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
      data: [group('Cologne')],
      error: null,
    });
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('network down'))
      .mockResolvedValueOnce(photonOk([6.96, 50.94]));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderUsePlaces();
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
        group('Cologne', {
          place_lat: 50.94,
          place_lng: 6.96,
          titles: ['Known entry'],
        }),
        group('Berlin', { titles: ['New entry'] }),
      ],
      error: null,
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(photonOk([13.4, 52.52])));

    const { result } = renderUsePlaces();
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
        group('Cologne', {
          place_lat: 50.94,
          place_lng: 6.96,
          titles: ['Known entry'],
        }),
        group('Nowhereville'),
      ],
      error: null,
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(photonFailure(404)));

    const { result } = renderUsePlaces();
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

  it('asks Photon for exactly one result in the resolved language', async () => {
    vi.mocked(listCategoryPlaces).mockResolvedValue({
      data: [group('Cologne')],
      error: null,
    });
    const fetchMock = vi.fn().mockResolvedValue(photonOk([6.96, 50.94]));
    vi.stubGlobal('fetch', fetchMock);

    renderUsePlaces({ language: 'de' });
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
      data: [group('Cologne')],
      error: null,
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(photonFailure(429))
      .mockResolvedValueOnce(photonOk([6.96, 50.94]));
    vi.stubGlobal('fetch', fetchMock);

    renderUsePlaces();
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
