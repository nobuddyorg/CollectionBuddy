// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

import { I18nProvider } from '../../i18n/I18nProvider';
import { ToastProvider } from '../Toast/ToastProvider';
import { useItems } from './useItems';
import {
  prefetchFirstPage,
  takePrefetchedFirstPage,
} from './firstPagePrefetch';
import type { listItems } from '../../data/items';

const { listItemsMock } = vi.hoisted(() => ({ listItemsMock: vi.fn() }));

vi.mock('../../data/items', () => ({
  listItems: (...args: unknown[]) =>
    listItemsMock(...args) as ReturnType<typeof listItems>,
}));

function wrapper({ children }: { children: ReactNode }) {
  return (
    <I18nProvider>
      <ToastProvider>{children}</ToastProvider>
    </I18nProvider>
  );
}

function page(items: { id: string }[] = [], count = items.length) {
  return {
    data: items.map((entry) => ({
      id: entry.id,
      title: entry.id,
      description: null,
      place: null,
      place_lat: null,
      place_lng: null,
      tags: [],
    })),
    error: null,
    count,
  };
}

const staleRead = () =>
  vi.fn(async () => page([{ id: 'stale' }])) as unknown as typeof listItems;

describe('useItems with a prefetched first page', () => {
  beforeEach(() => {
    window.localStorage.setItem('lang', 'en');
    listItemsMock.mockReset();
    void takePrefetchedFirstPage('');
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
