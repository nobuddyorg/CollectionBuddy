'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useI18n } from '../../i18n/useI18n';
import { useToast } from '../Toast/ToastProvider';
import { listItems } from '../../data/items';
import { clampPage, pageCount, pageRange } from './paging';
import type { ItemLite } from './types';

export function useItems(categoryId: string, q: string) {
  const { t } = useI18n();
  const toast = useToast();
  const [items, setItems] = useState<ItemLite[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  // Starts loading, because mounting always fetches (the effect below runs
  // unconditionally). Starting at `false` gave one render where there were
  // no items and nothing in flight, which is the state the list renders as
  // "No entries yet" -- so every category opened with a flash of the empty
  // state before its entries appeared.
  const [loading, setLoading] = useState(true);
  const reqSeq = useRef(0);
  // Counts non-silent requests currently in flight, rather than relying on
  // whichever request happens to be the one the sequence guard lets through.
  // A non-silent request superseded by a *silent* one used to return at the
  // guard below without clearing `loading`, and the silent one never clears
  // it either -- `loading` got stuck true forever (#303). Decrementing this
  // in `finally`, for every non-silent request that settles regardless of
  // whether it's the one that ends up "winning", means `loading` always
  // comes back down once nothing non-silent is left in flight.
  const pendingNonSilent = useRef(0);

  // Resets to page 1 whenever the category or search query changes, computed
  // at render time (rather than via a useEffect) so it takes effect the same
  // render the filters change instead of one render later.
  const filterKey = `${categoryId} ${q}`;
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey);
  if (filterKey !== prevFilterKey) {
    setPrevFilterKey(filterKey);
    setPage(1);
  }

  const totalPages = useMemo(() => pageCount(total), [total]);

  // Clamped rather than written back into `page` state via an effect: it's a
  // pure function of state that already exists, and deriving it avoids a
  // stale render where `.range()` below would otherwise request an
  // out-of-bounds slice (e.g. right after deleting the last item on the
  // last page) and the grid would render empty with no active page.
  const currentPage = clampPage(page, totalPages);

  // `silent` refetches without raising `loading`. A delete now removes its
  // card up front and resyncs behind that, so the refetch has no wait to
  // announce -- flagging it would only dim a grid the user already sees the
  // result in.
  const load = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      const mySeq = ++reqSeq.current;
      if (!silent) {
        pendingNonSilent.current += 1;
        setLoading(true);
      }

      try {
        const { from, to } = pageRange(currentPage);

        const { data, error, count } = await listItems({
          categoryId,
          search: q.trim(),
          from,
          to,
        });

        if (mySeq !== reqSeq.current) return;
        if (error) {
          toast.reportError('load items', error, t('item_list.search_error'));
          return;
        }

        setItems(
          (data ?? []).map((d) => ({
            id: d.id,
            title: d.title,
            description: d.description,
            place: d.place ?? null,
            place_lat: d.place_lat ?? null,
            place_lng: d.place_lng ?? null,
            tags: d.tags ?? [],
          })),
        );
        setTotal(count || 0);
      } finally {
        // Runs for every non-silent request that settles -- including one
        // discarded by the sequence guard above -- so `loading` always ends
        // up false once nothing non-silent is left in flight, regardless of
        // which request happens to be the last to resolve.
        if (!silent) {
          pendingNonSilent.current -= 1;
          if (pendingNonSilent.current === 0) setLoading(false);
        }
      }
    },
    [categoryId, currentPage, q, t, toast],
  );

  // Fetches on mount and whenever `load`'s own dependencies change --
  // exactly what an effect is for: synchronizing component state with the
  // database.
  useEffect(() => {
    void load();
  }, [load]);

  // `load` is recreated whenever the query/page/category change, but a
  // caller that kicks off a slow round trip (a delete's confirm + two
  // requests) and only *then* wants to resync can be holding a `load`/`reload`
  // reference from several renders ago -- the query may have moved on by the
  // time that round trip finishes. `reload` below stays one stable identity
  // and always dispatches through this ref, so whichever `reload` a caller
  // captured, calling it late still resyncs against whatever is current when
  // it actually runs, not whatever was current when it was captured (#303).
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  }, [load]);

  const reload = useCallback(
    (opts?: { silent?: boolean }) => loadRef.current(opts),
    [],
  );

  return {
    items,
    total,
    loading,
    page: currentPage,
    setPage,
    totalPages,
    reload,
    setItems,
  };
}
