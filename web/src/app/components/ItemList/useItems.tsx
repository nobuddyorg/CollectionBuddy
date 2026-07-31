'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useI18n } from '../../i18n/useI18n';
import { useToast } from '../Toast/ToastProvider';
import { listItems } from '../../data/items';
import type { ItemLite } from './types';

const PAGE_SIZE = 9;

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

  // Resets to page 1 whenever the category or search query changes, computed
  // at render time (rather than via a useEffect) so it takes effect the same
  // render the filters change instead of one render later.
  const filterKey = `${categoryId} ${q}`;
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey);
  if (filterKey !== prevFilterKey) {
    setPrevFilterKey(filterKey);
    setPage(1);
  }

  const totalPages = useMemo(() => Math.ceil(total / PAGE_SIZE), [total]);

  // Clamped rather than written back into `page` state via an effect: it's a
  // pure function of state that already exists, and deriving it avoids a
  // stale render where `.range()` below would otherwise request an
  // out-of-bounds slice (e.g. right after deleting the last item on the
  // last page) and the grid would render empty with no active page.
  const currentPage = totalPages > 0 ? Math.min(page, totalPages) : 1;

  const load = useCallback(async () => {
    const mySeq = ++reqSeq.current;
    setLoading(true);

    const from = (currentPage - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    const { data, error, count } = await listItems({
      categoryId,
      search: q.trim(),
      from,
      to,
    });

    if (mySeq !== reqSeq.current) return;
    setLoading(false);
    if (error) {
      console.error('Failed to load items:', error.message);
      toast.error(t('item_list.search_error'));
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
  }, [categoryId, currentPage, q, t, toast]);

  // Fetches on mount and whenever `load`'s own dependencies change --
  // exactly what an effect is for: synchronizing component state with the
  // database.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  return {
    items,
    total,
    loading,
    page: currentPage,
    setPage,
    totalPages,
    reload: load,
    setItems,
  };
}
