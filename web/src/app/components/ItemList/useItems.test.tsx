// @vitest-environment jsdom
import {
  act,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ToastWrapper as wrapper } from '../providers.test-support';
import {
  forgetPrefetchedFirstPage,
  prefetchFirstPage,
} from './firstPagePrefetch';
import { useItems } from './useItems';
import type { listItems } from '../../data/itemPage';

const { listItemsMock } = vi.hoisted(() => ({ listItemsMock: vi.fn() }));

vi.mock('../../data/itemPage', () => ({
  listItems: (...args: unknown[]) =>
    listItemsMock(...args) as ReturnType<typeof listItems>,
}));

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
    imageRows: [],
  };
}

function resetItemsTestState() {
  window.localStorage.setItem('lang', 'en');
  listItemsMock.mockReset();
  forgetPrefetchedFirstPage();
}

const staleRead = () =>
  vi.fn(async () => page([{ id: 'stale' }])) as unknown as typeof listItems;

// A response the test controls the timing of, so several requests can come back in any order.
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolveValue) => {
    resolve = resolveValue;
  });
  return { promise, resolve };
}

describe('useItems', () => {
  beforeEach(() => {
    resetItemsTestState();
  });

  it('reports a failed listing rather than throwing', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const listError = new Error('rls');
    listItemsMock.mockResolvedValue({
      data: null,
      error: listError,
      count: null,
      imageRows: null,
    });

    const { result } = renderHook(() => useItems('cat1', ''), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.items).toEqual([]);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not load entries. Please try again.',
    );
    expect(consoleError).toHaveBeenCalledWith('load items', listError);
    consoleError.mockRestore();
  });

  it('keeps whatever place and coordinates a row actually has, not just its nulls', async () => {
    listItemsMock.mockResolvedValue({
      data: [
        {
          id: 'coin-1',
          title: 'Denarius',
          description: null,
          place: 'Rome',
          place_lat: 41.9,
          place_lng: 12.5,
          tags: [],
        },
      ],
      error: null,
      count: 1,
      imageRows: [],
    });

    const { result } = renderHook(() => useItems('cat1', ''), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.items[0]).toMatchObject({
      place: 'Rome',
      place_lat: 41.9,
      place_lng: 12.5,
    });
  });

  it('trims the search term before sending it', async () => {
    listItemsMock.mockResolvedValue(page([]));

    renderHook(() => useItems('cat1', '  coin  '), { wrapper });

    await waitFor(() =>
      expect(listItemsMock).toHaveBeenCalledWith(
        expect.objectContaining({ search: 'coin' }),
      ),
    );
  });

  it('starts loading immediately, before the first request settles', () => {
    listItemsMock.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useItems('cat1', ''), { wrapper });

    expect(result.current.loading).toBe(true);
  });

  // The mount effect raises `loading` itself, so this looks at the render pass that reaches the screen first.
  it('paints its very first render already loading, never flashing the empty-category state', () => {
    listItemsMock.mockReturnValue(new Promise(() => {}));
    const passes: boolean[] = [];
    function Probe() {
      passes.push(useItems('cat1', '').loading);
      return null;
    }

    render(<Probe />, { wrapper });

    expect(passes[0]).toBe(true);
  });

  it('resets to page 1 when the search term changes while on a later page', async () => {
    listItemsMock.mockResolvedValue(page([{ id: 'a' }], 30));

    const { result, rerender } = renderHook(
      ({ query }: { query: string }) => useItems('cat1', query),
      { wrapper, initialProps: { query: '' } },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.setPage(2));
    expect(result.current.page).toBe(2);

    rerender({ query: 'coin' });

    expect(result.current.page).toBe(1);
  });

  it('resets to page 1 when the category changes while on a later page', async () => {
    listItemsMock.mockResolvedValue(page([{ id: 'a' }], 30));

    const { result, rerender } = renderHook(
      ({ categoryId }: { categoryId: string }) => useItems(categoryId, ''),
      { wrapper, initialProps: { categoryId: 'cat1' } },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.setPage(2));
    expect(result.current.page).toBe(2);

    rerender({ categoryId: 'cat2' });

    expect(result.current.page).toBe(1);
  });

  it('stays on the same page across a re-render that changes neither category nor search', async () => {
    listItemsMock.mockResolvedValue(page([{ id: 'a' }], 30));

    const { result, rerender } = renderHook(
      ({ query }: { query: string }) => useItems('cat1', query),
      { wrapper, initialProps: { query: 'coin' } },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.setPage(2));
    rerender({ query: 'coin' });

    expect(result.current.page).toBe(2);
  });

  // The clamp must be written back to the page: one derived at render lifts once the total grows again.
  it('stays on the page a delete clamped it to when the total grows again', async () => {
    let ids = Array.from({ length: 10 }, (_, index) => `item-${10 - index}`);
    listItemsMock.mockImplementation(
      async ({ from, to }: { from: number; to: number }) =>
        page(
          ids.slice(from, to + 1).map((id) => ({ id })),
          ids.length,
        ),
    );
    const { result } = renderHook(() => useItems('cat1', ''), { wrapper });
    await waitFor(() => expect(result.current.totalPages).toBe(2));
    act(() => result.current.setPage(2));
    await waitFor(() =>
      expect(result.current.items.map((entry) => entry.id)).toEqual(['item-1']),
    );

    // The only entry on page 2 goes, and the delete's silent reload clamps the grid to page 1.
    ids = ids.filter((id) => id !== 'item-1');
    await act(async () => {
      await result.current.reload({ silent: true });
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.page).toBe(1);

    // A new entry sorts first; on page 1 already, handleCreated only reloads.
    ids = ['item-11', ...ids];
    await act(async () => {
      await result.current.reload();
    });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.totalPages).toBe(2);
    expect(result.current.page).toBe(1);
    expect(result.current.items[0]?.id).toBe('item-11');
    expect(listItemsMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ from: 0 }),
    );
  });

  it('totals zero pages for an empty category rather than reporting one empty page', async () => {
    listItemsMock.mockResolvedValue(page([], 0));

    const { result } = renderHook(() => useItems('cat1', ''), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.totalPages).toBe(0);
  });
});

describe('useItems with a prefetched first page', () => {
  beforeEach(() => {
    resetItemsTestState();
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
    // The stale prefetch's total of one would have clamped the grid back to page 1.
    expect(result.current.page).toBe(2);
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
});

describe('useItems with requests in flight', () => {
  beforeEach(() => {
    resetItemsTestState();
  });

  // A superseding silent request must not leave the non-silent one's `loading` stuck true.
  it('clears loading once the only non-silent request settles, even though a later silent request is the one whose data wins', async () => {
    const mount = deferred<ReturnType<typeof page>>();
    const resync = deferred<ReturnType<typeof page>>();
    listItemsMock.mockReturnValueOnce(mount.promise);
    listItemsMock.mockReturnValueOnce(resync.promise);

    const { result } = renderHook(() => useItems('cat1', ''), { wrapper });
    expect(result.current.loading).toBe(true);

    // A silent resync, like a delete's trailing reload, starts while the mount fetch is in flight.
    await act(async () => {
      void result.current.reload({ silent: true });
    });

    // The later, silent request settles first...
    await act(async () => {
      resync.resolve(page([{ id: 'b' }]));
      await resync.promise;
    });
    // Its data is applied straight away, without touching `loading`.
    expect(result.current.items.map((entry) => entry.id)).toEqual(['b']);
    expect(result.current.loading).toBe(true);

    // ...then the superseded non-silent mount fetch settles after it.
    await act(async () => {
      mount.resolve(page([{ id: 'a' }]));
      await mount.promise;
    });

    // Its stale data must not overwrite the newer result, but it is still what clears `loading`.
    expect(result.current.items.map((entry) => entry.id)).toEqual(['b']);
    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it('keeps loading true until every non-silent request in flight has settled', async () => {
    const first = deferred<ReturnType<typeof page>>();
    const second = deferred<ReturnType<typeof page>>();
    listItemsMock.mockReturnValueOnce(first.promise);
    listItemsMock.mockReturnValueOnce(second.promise);

    const { result } = renderHook(() => useItems('cat1', ''), { wrapper });

    await act(async () => {
      void result.current.reload();
    });
    expect(result.current.loading).toBe(true);

    await act(async () => {
      first.resolve(page([]));
      await first.promise;
    });
    // One of the two non-silent requests is still outstanding.
    expect(result.current.loading).toBe(true);

    await act(async () => {
      second.resolve(page([]));
      await second.promise;
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  // `reload` keeps one identity and dispatches through a ref, so a captured one resyncs against the current query.
  it('resyncs against the query current when it runs, not the one active when reload was captured', async () => {
    listItemsMock.mockResolvedValue(page([{ id: 'coin-1' }]));

    const { result, rerender } = renderHook(
      ({ query }: { query: string }) => useItems('cat1', query),
      { wrapper, initialProps: { query: 'coin' } },
    );

    await waitFor(() =>
      expect(listItemsMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ search: 'coin' }),
      ),
    );

    // Captured before the query changes, like the reload a delete's handler closes over.
    const capturedReload = result.current.reload;

    // The search is cleared while the simulated delete round trip is still running.
    rerender({ query: '' });
    await waitFor(() =>
      expect(listItemsMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ search: '' }),
      ),
    );

    listItemsMock.mockClear();
    listItemsMock.mockResolvedValue(page([{ id: 'other' }]));

    // The delete's trailing resync fires through the reload captured when the query was still "coin".
    await act(async () => {
      await capturedReload({ silent: true });
    });

    // For the current query, not the captured one, and reload is the same function throughout.
    expect(listItemsMock).toHaveBeenCalledWith(
      expect.objectContaining({ search: '' }),
    );
    expect(result.current.reload).toBe(capturedReload);
  });

  it('does not clobber a newer query result with a stale one that resolves after it', async () => {
    const stale = deferred<ReturnType<typeof page>>();
    listItemsMock.mockReturnValueOnce(stale.promise);

    const { result, rerender } = renderHook(
      ({ query }: { query: string }) => useItems('cat1', query),
      { wrapper, initialProps: { query: 'coin' } },
    );
    expect(listItemsMock).toHaveBeenCalledTimes(1);

    const fresh = deferred<ReturnType<typeof page>>();
    listItemsMock.mockReturnValueOnce(fresh.promise);
    rerender({ query: '' });
    expect(listItemsMock).toHaveBeenCalledTimes(2);

    // The fresh (current-query) request lands first.
    await act(async () => {
      fresh.resolve(page([{ id: 'fresh' }]));
      await fresh.promise;
    });
    expect(result.current.items.map((entry) => entry.id)).toEqual(['fresh']);

    // The stale (old-query) request, already in flight when the query changed, lands after it.
    await act(async () => {
      stale.resolve(page([{ id: 'coin-1' }]));
      await stale.promise;
    });

    // The grid must keep showing the current query's result.
    expect(result.current.items.map((entry) => entry.id)).toEqual(['fresh']);
  });

  it('aborts whatever request is still in flight on unmount', () => {
    listItemsMock.mockReturnValue(new Promise(() => {}));

    const { unmount } = renderHook(() => useItems('cat1', ''), { wrapper });
    const [options] = listItemsMock.mock.calls[0] as Parameters<
      typeof listItems
    >;
    const signal = options.signal!;
    expect(signal.aborted).toBe(false);

    unmount();

    expect(signal.aborted).toBe(true);
  });
});
