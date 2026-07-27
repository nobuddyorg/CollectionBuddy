'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useI18n } from '../../i18n/useI18n';
import { useToast } from '../Toast/ToastProvider';
import { listItems } from '../../data/items';
import type { ItemLite } from './types';

const PAGE_SIZE = 6;

export function useItems(categoryId: string, q: string) {
  const { t } = useI18n();
  const toast = useToast();
  const [items, setItems] = useState<ItemLite[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const reqSeq = useRef(0);

  useEffect(() => setPage(1), [categoryId, q]);

  const totalPages = useMemo(() => Math.ceil(total / PAGE_SIZE), [total]);

  // Clamp page when the result set shrinks out from under it (e.g. deleting
  // the last item on the last page), otherwise `.range()` requests an
  // out-of-bounds slice and the grid renders empty with no active page.
  useEffect(() => {
    if (totalPages > 0 && page > totalPages) {
      setPage(totalPages);
    } else if (totalPages === 0 && page !== 1) {
      setPage(1);
    }
  }, [totalPages, page]);

  const load = useCallback(async () => {
    const mySeq = ++reqSeq.current;
    setLoading(true);

    const from = (page - 1) * PAGE_SIZE;
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
        tags: d.tags ?? [],
      })),
    );
    setTotal(count || 0);
  }, [categoryId, page, q, t, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  return {
    items,
    total,
    loading,
    page,
    setPage,
    totalPages,
    reload: load,
    setItems,
  };
}
