// @vitest-environment jsdom
import { act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  installUsePlacesMocks,
  renderUsePlaces,
  restoreGlobalsAndTimers,
} from './usePlaces.hook.test-support';
import { group, photonFailure, photonOk } from './usePlaces.test-support';
import { listCategoryPlaces } from '../../data/items';

vi.mock('../../data/items', () => ({
  listCategoryPlaces: vi.fn(),
  updateItemsPlace: vi.fn(),
}));

const unlocated = (count: number) =>
  Array.from({ length: count }, (_, index) =>
    group(`Place${index + 1}`, { ids: [`id-${index + 1}`] }),
  );

async function advance(milliseconds: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(milliseconds);
  });
}

describe('usePlaces pacing', () => {
  beforeEach(() => {
    installUsePlacesMocks();
    vi.useFakeTimers();
  });

  afterEach(restoreGlobalsAndTimers);

  it('caps concurrent geocode lookups at the configured limit rather than firing every request at once', async () => {
    vi.mocked(listCategoryPlaces).mockResolvedValue({
      data: unlocated(5),
      error: null,
    });
    const fetchMock = vi.fn(() => new Promise(() => {}));
    vi.stubGlobal('fetch', fetchMock);

    renderUsePlaces();
    await advance(10_000);

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  // Photon throttles "extensive usage": three starts a second, however fast it answers.
  it('starts lookups no closer than a third of a second apart, even when each answers at once', async () => {
    vi.mocked(listCategoryPlaces).mockResolvedValue({
      data: unlocated(5),
      error: null,
    });
    const fetchMock = vi.fn().mockResolvedValue(photonOk([6.96, 50.94]));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderUsePlaces();
    await advance(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await advance(333);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await advance(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await advance(334);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    await advance(668);

    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(result.current.places).toHaveLength(5);
    expect(result.current.loading).toBe(false);
  });

  it('paces a retry like any other lookup', async () => {
    vi.mocked(listCategoryPlaces).mockResolvedValue({
      data: unlocated(1),
      error: null,
    });
    const fetchMock = vi.fn().mockResolvedValue(photonFailure(503));
    vi.stubGlobal('fetch', fetchMock);

    renderUsePlaces();
    await advance(0);
    // The backoff (500 ms) outlasts the gap, so the retry goes as soon as the backoff ends.
    await advance(499);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await advance(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  // A place that failed its last attempt has nothing left to wait for; the badge should go with it.
  it('stops loading the moment the final attempt fails, without backing off after it', async () => {
    vi.mocked(listCategoryPlaces).mockResolvedValue({
      data: unlocated(1),
      error: null,
    });
    const fetchMock = vi.fn().mockResolvedValue(photonFailure(503));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderUsePlaces();
    // Backoffs of 500 and 1,000 ms put the third and last attempt at 1,500 ms.
    await advance(1499);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.current.loading).toBe(true);
    await advance(1);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe(true);
  });
});
