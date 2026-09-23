// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

import { I18nProvider } from '../../i18n/I18nProvider';
import { ToastProvider } from '../Toast/ToastProvider';
import { useItems } from './useItems';
import { takePrefetchedFirstPage } from './firstPagePrefetch';
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

// A response the test controls the timing of, so several requests can come back in any order.
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolveValue) => {
    resolve = resolveValue;
  });
  return { promise, resolve };
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

describe('useItems with requests in flight', () => {
  beforeEach(() => {
    window.localStorage.setItem('lang', 'en');
    listItemsMock.mockReset();
    void takePrefetchedFirstPage('');
  });

  // A non-silent request superseded by a silent one used to leave `loading` stuck true forever.
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
