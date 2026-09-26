'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useI18n } from '../../i18n/useI18n';
import { useToast } from '../Toast/ToastProvider';
import { listItems } from '../../data/itemPage';
import { clampPage, pageCount, pageRange } from './paging';
import { takePrefetchedFirstPage } from './firstPagePrefetch';
import { useRequestSequence } from '../../lib/useRequestSequence';
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
  const { next, isCurrent } = useRequestSequence();
  // Aborts a superseded request's own fetch, not just its effect, so the response stops downloading.
  const abortRef = useRef<AbortController | null>(null);
  // Non-silent requests in flight: one superseded by a silent request used to leave `loading` stuck true.
  const pendingNonSilent = useRef(0);

  // At render time, not in an effect, so the page resets the same render the filters change.
  const filterKey = `${categoryId} ${query}`;
  const [previousFilterKey, setPreviousFilterKey] = useState(filterKey);
  if (filterKey !== previousFilterKey) {
    setPreviousFilterKey(filterKey);
    setPage(1);
  }

  const totalPages = useMemo(() => pageCount(total), [total]);

  // Derived, not written back via an effect, so `.range()` never asks for an out-of-bounds slice.
  const currentPage = clampPage(page, totalPages);

  // `silent` refetches without raising `loading`: a delete already removed its card up front.
  const load = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      const sequenceNumber = next();
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

        if (!isCurrent(sequenceNumber)) return;
        if (error) {
          toast.reportError('load items', error, t('item_list.search_error'));
          return;
        }

        const loaded = (data ?? []).map((row) => ({
          id: row.id,
          title: row.title,
          description: row.description,
          place: row.place ?? null,
          place_lat: row.place_lat ?? null,
          place_lng: row.place_lng ?? null,
          tags: row.tags ?? [],
        }));
        setItems(loaded);
        setPageImages(
          imageRows && {
            itemIdsKey: loaded.map((item) => item.id).join(','),
            rows: imageRows,
          },
        );
        setTotal(count || 0);
      } finally {
        // Runs for a discarded request too, so `loading` ends false whichever request resolves last.
        if (!silent) {
          pendingNonSilent.current -= 1;
          if (pendingNonSilent.current === 0) setLoading(false);
        }
      }
    },
    [categoryId, currentPage, query, t, toast, next, isCurrent],
  );

  // A filter change aborts the previous load itself; unmount never gets that chance otherwise.
  useEffect(() => {
    void load();
    return () => abortRef.current!.abort();
  }, [load]);

  // One stable identity dispatching through a ref, so a late `reload` resyncs against what is current then.
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  }, [load]);

  const reload = useCallback(
    (options?: { silent?: boolean }) => loadRef.current(options),
    [],
  );

  return {
    items,
    pageImages,
    total,
    loading,
    page: currentPage,
    setPage,
    totalPages,
    reload,
    setItems,
  };
}
