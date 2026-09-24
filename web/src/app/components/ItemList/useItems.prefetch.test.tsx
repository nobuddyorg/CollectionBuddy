// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useItems } from './useItems';
import { prefetchFirstPage } from './firstPagePrefetch';
import { page, resetItemsTestState, wrapper } from './useItems.test-support';
import type { listItems } from '../../data/items';

const { listItemsMock } = vi.hoisted(() => ({ listItemsMock: vi.fn() }));

vi.mock('../../data/items', () => ({
  listItems: (...args: unknown[]) =>
    listItemsMock(...args) as ReturnType<typeof listItems>,
}));

const staleRead = () =>
  vi.fn(async () => page([{ id: 'stale' }])) as unknown as typeof listItems;

describe('useItems with a prefetched first page', () => {
  beforeEach(() => {
    resetItemsTestState(listItemsMock);
  });

  const photo = {
    id: 'p1',
    item_id: 'a',
    path_full: 'u/a/p1.webp',
    path_thumb: null,
  };

  it('uses the first page prefetched for this category instead of asking again', async () => {
    const prefetched = vi.fn(async () => ({
      ...page([{ id: 'a' }]),
      imageRows: [photo],
    }));
    prefetchFirstPage('cat1', prefetched);

    const { result } = renderHook(() => useItems('cat1', ''), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.items.map((entry) => entry.id)).toEqual(['a']);
    expect(listItemsMock).not.toHaveBeenCalled();
  });

  it('leaves a prefetched page alone for a later page', async () => {
    listItemsMock.mockResolvedValue(page([{ id: 'a' }], 20));
    const { result } = renderHook(() => useItems('cat1', ''), { wrapper });
    await waitFor(() => expect(result.current.total).toBe(20));
    prefetchFirstPage('cat1', staleRead());

    act(() => result.current.setPage(2));

    await waitFor(() => expect(listItemsMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.items.map((entry) => entry.id)).toEqual(['a']);
  });

  it('leaves a prefetched page alone for a silent reload', async () => {
    listItemsMock.mockResolvedValue(page([{ id: 'a' }]));
    const { result } = renderHook(() => useItems('cat1', ''), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    prefetchFirstPage('cat1', staleRead());

    await act(async () => {
      await result.current.reload({ silent: true });
    });

    expect(listItemsMock).toHaveBeenCalledTimes(2);
    expect(result.current.items.map((entry) => entry.id)).toEqual(['a']);
  });

  it('ignores a prefetched page when the first read is a search', async () => {
    prefetchFirstPage('cat1', staleRead());
    listItemsMock.mockResolvedValue(page([{ id: 'match' }]));

    const { result } = renderHook(() => useItems('cat1', 'coin'), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.items.map((entry) => entry.id)).toEqual(['match']);
    expect(listItemsMock).toHaveBeenCalledOnce();
  });

  it("tags the page's carried photograph rows with the items they cover", async () => {
    listItemsMock.mockResolvedValue({
      ...page([{ id: 'a' }, { id: 'b' }]),
      imageRows: [photo],
    });

    const { result } = renderHook(() => useItems('cat1', ''), { wrapper });

    await waitFor(() =>
      expect(result.current.pageImages).toEqual({
        itemIdsKey: 'a,b',
        rows: [photo],
      }),
    );
  });

  it('carries no photograph rows for a read that did not bring any', async () => {
    listItemsMock.mockResolvedValue({
      ...page([{ id: 'a' }]),
      imageRows: null,
    });

    const { result } = renderHook(() => useItems('cat1', 'coin'), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.pageImages).toBeNull();
  });
});
