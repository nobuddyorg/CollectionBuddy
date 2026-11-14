// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ToastWrapper as wrapper } from '../providers.test-support';
import {
  forgetPrefetchedFirstPage,
  prefetchFirstPage,
} from './firstPagePrefetch';
import type { PageSize } from './paging';
import { useItems } from './useItems';
import type { listItems } from '../../data/itemPage';

const { listItemsMock } = vi.hoisted(() => ({ listItemsMock: vi.fn() }));

vi.mock('../../data/itemPage', () => ({
  listItems: (...args: unknown[]) =>
    listItemsMock(...args) as ReturnType<typeof listItems>,
}));

/** An empty page standing for a collection of `count` entries. */
const collectionOf = (count: number) => ({
  data: [],
  error: null,
  count,
  imageRows: [],
});

function renderAt(pageSize: PageSize) {
  return renderHook(({ size }) => useItems('cat1', '', size), {
    wrapper,
    initialProps: { size: pageSize },
  });
}

const lastRange = () => {
  const [{ from, to }] = listItemsMock.mock.lastCall as [
    { from: number; to: number },
  ];
  return { from, to };
};

describe('useItems at a page size', () => {
  beforeEach(() => {
    window.localStorage.setItem('lang', 'en');
    listItemsMock.mockReset();
    forgetPrefetchedFirstPage();
  });

  it('asks for a page of the size it is given, and counts pages at it', async () => {
    listItemsMock.mockResolvedValue(collectionOf(50));
    const { result } = renderAt(24);
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(lastRange()).toEqual({ from: 0, to: 23 });
    expect(result.current.totalPages).toBe(3);

    act(() => result.current.setPage(2));
    await waitFor(() => expect(lastRange()).toEqual({ from: 24, to: 47 }));
  });

  // Page 3 at 9 starts with the 19th entry; at 6 that is on page 4, at 24 on page 1.
  it.each([
    [6, 4, { from: 18, to: 23 }],
    [24, 1, { from: 0, to: 23 }],
  ] as const)(
    'keeps the entry first on screen when the size changes to %d: page %d',
    async (size, page, range) => {
      listItemsMock.mockResolvedValue(collectionOf(100));
      const { result, rerender } = renderAt(9);
      await waitFor(() => expect(result.current.loading).toBe(false));
      act(() => result.current.setPage(3));
      await waitFor(() => expect(lastRange()).toEqual({ from: 18, to: 26 }));

      rerender({ size });

      expect(result.current.page).toBe(page);
      await waitFor(() => expect(lastRange()).toEqual(range));
    },
  );

  it('raises loading again for another size, before its answer arrives', async () => {
    listItemsMock.mockResolvedValueOnce(collectionOf(30));
    listItemsMock.mockReturnValueOnce(new Promise(() => {}));
    const { result, rerender } = renderAt(9);
    await waitFor(() => expect(result.current.loading).toBe(false));

    rerender({ size: 12 });

    expect(result.current.loading).toBe(true);
  });

  it('stays on the page it is on while neither the size nor the filter changes', async () => {
    listItemsMock.mockResolvedValue(collectionOf(100));
    const { result, rerender } = renderAt(12);
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.setPage(4));
    await waitFor(() => expect(result.current.page).toBe(4));

    rerender({ size: 12 });

    expect(result.current.page).toBe(4);
  });

  it('uses a first page prefetched at its own size', async () => {
    const prefetched = vi.fn(async () => collectionOf(40));
    prefetchFirstPage('cat1', 24, prefetched);

    const { result } = renderAt(24);
    await waitFor(() => expect(result.current.total).toBe(40));

    expect(listItemsMock).not.toHaveBeenCalled();
  });

  it('asks afresh rather than use a first page prefetched at another size', async () => {
    const prefetched = vi.fn(async () => collectionOf(40));
    prefetchFirstPage('cat1', 9, prefetched);
    listItemsMock.mockResolvedValue(collectionOf(40));

    renderAt(24);

    await waitFor(() => expect(lastRange()).toEqual({ from: 0, to: 23 }));
  });
});
