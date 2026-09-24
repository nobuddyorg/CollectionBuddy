// @vitest-environment jsdom
import { act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  installUsePlacesMocks,
  renderUsePlaces,
  restoreGlobalsAndTimers,
} from './usePlaces.hook.test-support';
import { group, photonOk } from './usePlaces.test-support';
import { listCategoryPlaces } from '../../data/items';

vi.mock('../../data/items', () => ({
  listCategoryPlaces: vi.fn(),
  updateItemsPlace: vi.fn(),
}));

describe('usePlaces geocode cache', () => {
  beforeEach(installUsePlacesMocks);

  afterEach(restoreGlobalsAndTimers);

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

    const { result } = renderUsePlaces();
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

    const { result } = renderUsePlaces();
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

    const { result } = renderUsePlaces();
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

    renderUsePlaces();
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(setItemSpy).not.toHaveBeenCalled();
    setItemSpy.mockRestore();
  });
});
