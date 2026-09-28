'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useI18n } from '../../i18n/useI18n';
import { useToast } from '../Toast/ToastProvider';
import { listItems } from '../../data/itemPage';
import { clampPage, pageCount, pageRange } from './paging';
import { takePrefetchedFirstPage } from './firstPagePrefetch';
import { useSyncedRef } from '../../lib/useSyncedRef';
import type { PageImages } from './imageEntries';
import type { ItemLite } from './types';

export function useItems(categoryId: string, query: string) {
  const { t } = useI18n();
  const toast = useToast();
  const [items, setItems] = useState<ItemLite[]>([]);
  const [pageImages, setPageImages] = useState<PageImages | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  // Starts true: starting false gave one render that looked exactly like "No entries yet".
  const [loading, setLoading] = useState(true);
  // Kept apart from an empty list: a failed load must not read as a category with no entries.
  const [loadFailed, setLoadFailed] = useState(false);
  // Aborted when superseded or unmounted, so the response stops downloading and its answer is dropped.
  const abortRef = useRef<AbortController | null>(null);
  // Counts non-silent loads in flight, so a superseding silent load cannot leave `loading` stuck true.
  const pendingNonSilent = useRef(0);

  const totalPages = useMemo(() => pageCount(total), [total]);

  // Clamped in render, not an effect, so `.range()` never asks for an out-of-bounds slice.
  const currentPage = clampPage(page, totalPages);

  // At render time, not in an effect, so the page resets the same render the filters change.
  const filterKey = `${categoryId} ${query}`;
  const [previousFilterKey, setPreviousFilterKey] = useState(filterKey);
  if (filterKey !== previousFilterKey) {
    setPreviousFilterKey(filterKey);
    setPage(1);
  } else if (page !== currentPage) {
    // Written back, or a later rise in the total lifts the clamp and jumps to the stale page.
    setPage(currentPage);
  }

  // `silent` refetches without raising `loading`: a delete already removed its card up front.
  const load = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      if (!silent) {
        pendingNonSilent.current += 1;
        setLoading(true);
      }

      try {
        const { from, to } = pageRange(currentPage);
        const search = query.trim();
        const prefetched =
          !silent && currentPage === 1 && !search
            ? takePrefetchedFirstPage(categoryId)
            : null;

        const { data, error, count, imageRows } = await (prefetched ??
          listItems({
            categoryId,
            search,
            from,
            to,
            signal: controller.signal,
          }));

        // postgrest-js resolves an aborted fetch with an AbortError `error`: not a failure worth a toast.
        if (controller.signal.aborted) return;
        if (error !== null) {
          setLoadFailed(true);
          toast.reportError(
            'load items',
            error,
            search ? t('item_list.search_error') : t('item_list.load_error'),
          );
          return;
        }

        setItems(data);
        setPageImages({
          itemIdsKey: data.map((item) => item.id).join(','),
          rows: imageRows,
        });
        setTotal(count);
        setLoadFailed(false);
      } finally {
        // Runs for a discarded request too, so `loading` ends false whichever request resolves last.
        if (!silent) {
          pendingNonSilent.current -= 1;
          if (pendingNonSilent.current === 0) setLoading(false);
        }
      }
    },
    [categoryId, currentPage, query, t, toast],
  );

  // A filter change aborts the previous load itself; unmount never gets that chance otherwise.
  useEffect(() => {
    void load();
    return () => abortRef.current!.abort();
  }, [load]);

  // One stable identity dispatching through a ref, so a late `reload` resyncs against what is current then.
  const loadRef = useSyncedRef(load);

  const reload = useCallback(
    (options?: { silent?: boolean }) => loadRef.current(options),
    [loadRef],
  );

  return {
    items,
    pageImages,
    total,
    loading,
    loadFailed,
    page: currentPage,
    setPage,
    totalPages,
    reload,
    setItems,
  };
}
