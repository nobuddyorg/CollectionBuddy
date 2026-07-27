'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useI18n } from '../../i18n/useI18n';
import { supabase } from '../../supabase';
import type { ItemLite, ItemRow } from './types';

const PAGE_SIZE = 6;

export function useItems(categoryId: string, q: string) {
  const { t } = useI18n();
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

    // Below 3 characters the trigram indexes can't produce any candidates
    // (ILIKE %q% needs at least one 3-char trigram to seed a bitmap scan),
    // so a 1-2 char search would force a sequential scan on every
    // keystroke for no benefit. Same threshold PlaceAutocomplete already
    // uses.
    if (needle.length >= 3) {
      // Escape LIKE metacharacters first, then quote the value so that
      // PostgREST's or=() grammar (which treats , . ( ) as structural
      // delimiters) sees one opaque string instead of parsing the search
      // term as extra filter conditions.
      const likeEscaped = needle
        .replace(/\\/g, '\\\\')
        .replace(/[%_]/g, '\\$&');
      const like = `%${likeEscaped}%`;
      const quoted = like.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      query = query.or(
        `title.ilike."${quoted}",description.ilike."${quoted}",place.ilike."${quoted}",tags_text.ilike."${quoted}"`,
      );
    }

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(from, to)
      .returns<ItemRow[]>();

    if (mySeq !== reqSeq.current) return;
    setLoading(false);
    if (error) {
      console.error('Failed to load items:', error.message);
      alert(t('item_list.search_error'));
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
  }, [categoryId, page, q, t]);

  useEffect(() => {
    void load();
  }, [load]);

  return { items, loading, page, setPage, totalPages, reload: load, setItems };
}
