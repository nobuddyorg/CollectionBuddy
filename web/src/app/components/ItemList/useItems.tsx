'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { supabase } from '../../supabase';
import type { ItemLite, ItemRow } from './types';

const PAGE_SIZE = 6;

export function useItems(categoryId: string, q: string) {
  const [items, setItems] = useState<ItemLite[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const reqSeq = useRef(0);

  useEffect(() => setPage(1), [categoryId, q]);

  const totalPages = useMemo(() => Math.ceil(total / PAGE_SIZE), [total]);

  const load = useCallback(async () => {
    const mySeq = ++reqSeq.current;
    setLoading(true);

    const from = (page - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const needle = q.trim();

    let query = supabase
      .from('items')
      .select(
        'id,title,description,place,tags,item_categories!inner(category_id)',
        { count: 'exact' },
      )
      .eq('item_categories.category_id', categoryId);

    if (needle) {
      const esc = needle.replace(/[%_]/g, '\\$&');
      const like = `%${esc}%`;
      query = query.or(
        `title.ilike.${like},description.ilike.${like},place.ilike.${like},tags_text.ilike.${like}`,
      );
    }

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(from, to)
      .returns<ItemRow[]>();

    if (mySeq !== reqSeq.current) return;
    setLoading(false);
    if (error) return;

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
  }, [categoryId, page, q]);

  useEffect(() => {
    void load();
  }, [load]);

  return { items, loading, page, setPage, totalPages, reload: load, setItems };
}
