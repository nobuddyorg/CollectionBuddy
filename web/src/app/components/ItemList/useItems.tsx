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
  // Starts true: mounting always fetches, and starting false gave one
  // render that looked exactly like "No entries yet" before data arrived.
  const [loading, setLoading] = useState(true);
  const reqSeq = useRef(0);
  // Aborts a superseded request's own fetch, not just its effect on state
  // -- otherwise the response still finishes downloading after the sequence
  // guard below has already discarded it.
  const abortRef = useRef<AbortController | null>(null);
  // Counts non-silent requests in flight rather than trusting whichever one
  // the sequence guard lets through: a non-silent request superseded by a
  // silent one used to leave `loading` stuck true forever, since neither
  // cleared it. Decrementing this for every non-silent settle, win or not,
  // brings `loading` back down once none are left.
  const pendingNonSilent = useRef(0);

  // Computed at render time, not via useEffect, so resetting to page 1
  // takes effect the same render the filters change, not one render later.
  const filterKey = `${categoryId} ${q}`;
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey);
  if (filterKey !== prevFilterKey) {
    setPrevFilterKey(filterKey);
    setPage(1);
  }

  const totalPages = useMemo(() => pageCount(total), [total]);

  // Derived, not written back into `page` via an effect -- avoids a stale
  // render where `.range()` below would request an out-of-bounds slice
  // right after deleting the last item on the last page.
  const currentPage = clampPage(page, totalPages);

  // `silent` refetches without raising `loading` -- a delete already
  // removed its card up front, so flagging this refetch would only dim a
  // grid the user has already seen the result in.
  const load = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      const mySeq = ++reqSeq.current;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
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
          signal: controller.signal,
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
        // Runs even for a request the sequence guard above discarded, so
        // `loading` ends up false regardless of which request resolves last.
        if (!silent) {
          pendingNonSilent.current -= 1;
          if (pendingNonSilent.current === 0) setLoading(false);
        }
      }
    },
    [categoryId, currentPage, q, t, toast],
  );

  // Cleanup aborts whatever's still in flight on unmount -- a new `load`
  // triggered by a filter change would already abort it, but unmounting
  // never gets that chance otherwise.
  useEffect(() => {
    void load();
    return () => abortRef.current?.abort();
  }, [load]);

  // `load` is recreated whenever the query/page/category change, but a
  // caller that kicks off a slow round trip may be holding a `reload`
  // reference from several renders ago. `reload` stays one stable identity
  // and dispatches through this ref, so a late call resyncs against
  // whatever is current when it runs, not when it was captured.
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
