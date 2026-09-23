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

describe('usePlaces listing', () => {
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

  // An empty `known` batch equals the unconditional `setPlaces([])` before it, so only a render count tells.
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
