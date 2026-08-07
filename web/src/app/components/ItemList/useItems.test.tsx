// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

import { I18nProvider } from '../../i18n/I18nProvider';
import { ToastProvider } from '../Toast/ToastProvider';
import { useItems } from './useItems';

const { listItemsMock } = vi.hoisted(() => ({ listItemsMock: vi.fn() }));

vi.mock('../../data/items', () => ({
  listItems: (...args: unknown[]) => listItemsMock(...args),
}));

function wrapper({ children }: { children: ReactNode }) {
  return (
    <I18nProvider>
      <ToastProvider>{children}</ToastProvider>
    </I18nProvider>
  );
}

// A response the test controls the timing of, standing in for the network
// round trip `load` awaits -- so a test can start several requests and
// choose the order they come back in, rather than the order they were sent.
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function page(items: { id: string }[] = [], count = items.length) {
  return {
    data: items.map((it) => ({
      id: it.id,
      title: it.id,
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

describe('useItems', () => {
  beforeEach(() => {
    window.localStorage.setItem('lang', 'en');
    listItemsMock.mockReset();
  });

  // #303(b): `loading` used to only clear on the specific request that
  // happened to reach the `!silent` branch after passing the sequence
  // guard. A non-silent request superseded by a *silent* one returned at
  // the guard without clearing it, and the silent one never clears it
  // either -- `loading` got stuck true forever. `pendingNonSilent` fixes
  // this by decrementing for every non-silent request that settles,
  // discarded or not.
  it('clears loading once the only non-silent request settles, even though a later silent request is the one whose data wins', async () => {
    const mount = deferred<ReturnType<typeof page>>();
    const resync = deferred<ReturnType<typeof page>>();
    listItemsMock.mockReturnValueOnce(mount.promise);
    listItemsMock.mockReturnValueOnce(resync.promise);

    const { result } = renderHook(() => useItems('cat1', ''), { wrapper });
    expect(result.current.loading).toBe(true);

    // A silent resync -- the same shape as a delete's trailing reload({
    // silent: true }) -- starts while the initial mount fetch is still in
    // flight.
    await act(async () => {
      void result.current.reload({ silent: true });
    });

    // The later, silent request settles first...
    await act(async () => {
      resync.resolve(page([{ id: 'b' }]));
      await resync.promise;
    });
    // Its data is applied straight away, without touching `loading`.
    expect(result.current.items.map((it) => it.id)).toEqual(['b']);
    expect(result.current.loading).toBe(true);

    // ...then the original non-silent mount fetch, now superseded, settles
    // after it.
    await act(async () => {
      mount.resolve(page([{ id: 'a' }]));
      await mount.promise;
    });

    // Its (stale) data must not overwrite the silent request's newer
    // result, but it is still the request that clears `loading`.
    expect(result.current.items.map((it) => it.id)).toEqual(['b']);
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

  // #303(a): `reload` used to just be `load` itself, a `useCallback` keyed
  // on `[categoryId, currentPage, q, t, toast]`. A caller that held onto a
  // `reload` reference across a slow round trip (a delete's confirm + two
  // requests) and called it once the query had since changed fired a
  // request for the *old* query. `reload` now keeps one stable identity
  // and dispatches through a ref that always points at the latest `load`,
  // so calling whatever `reload` a caller captured still resyncs against
  // whatever is current by the time it actually runs.
  it('resyncs against the query current when it runs, not the one active when reload was captured', async () => {
    listItemsMock.mockResolvedValue(page([{ id: 'coin-1' }]));

    const { result, rerender } = renderHook(
      ({ q }: { q: string }) => useItems('cat1', q),
      { wrapper, initialProps: { q: 'coin' } },
    );

    await waitFor(() =>
      expect(listItemsMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ search: 'coin' }),
      ),
    );

    // Captured before the query changes -- standing in for the reload a
    // delete's onClick handler closes over the moment the trash icon is
    // pressed.
    const capturedReload = result.current.reload;

    // The search is cleared while the (simulated) delete round trip is
    // still running.
    rerender({ q: '' });
    await waitFor(() =>
      expect(listItemsMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ search: '' }),
      ),
    );

    listItemsMock.mockClear();
    listItemsMock.mockResolvedValue(page([{ id: 'other' }]));

    // The delete's trailing resync finally fires, through the reload
    // reference captured back when the query was still "coin".
    await act(async () => {
      await capturedReload({ silent: true });
    });

    // It must have gone out for the *current* query, not the one active
    // when it was captured -- and reload is the very same stable function
    // the whole time.
    expect(listItemsMock).toHaveBeenCalledWith(
      expect.objectContaining({ search: '' }),
    );
    expect(result.current.reload).toBe(capturedReload);
  });

  it('does not clobber a newer query result with a stale one that resolves after it', async () => {
    const stale = deferred<ReturnType<typeof page>>();
    listItemsMock.mockReturnValueOnce(stale.promise);

    const { result, rerender } = renderHook(
      ({ q }: { q: string }) => useItems('cat1', q),
      { wrapper, initialProps: { q: 'coin' } },
    );
    expect(listItemsMock).toHaveBeenCalledTimes(1);

    const fresh = deferred<ReturnType<typeof page>>();
    listItemsMock.mockReturnValueOnce(fresh.promise);
    rerender({ q: '' });
    expect(listItemsMock).toHaveBeenCalledTimes(2);

    // The fresh (current-query) request lands first.
    await act(async () => {
      fresh.resolve(page([{ id: 'fresh' }]));
      await fresh.promise;
    });
    expect(result.current.items.map((it) => it.id)).toEqual(['fresh']);

    // The stale (old-query) request, which was already in flight when the
    // query changed, lands after it.
    await act(async () => {
      stale.resolve(page([{ id: 'coin-1' }]));
      await stale.promise;
    });

    // The grid must keep showing the current query's result.
    expect(result.current.items.map((it) => it.id)).toEqual(['fresh']);
  });
});
