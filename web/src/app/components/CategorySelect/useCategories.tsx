'use client';

import { useCallback, useState } from 'react';

import { useI18n } from '../../i18n/useI18n';
import { supabase } from '../../supabase';
import { useToast } from '../Toast/ToastProvider';
import { removeItemImages } from '../ItemList/useItemImages';
import type { Category } from '../../types';

export function useCategories() {
  const { t } = useI18n();
  const toast = useToast();
  const [cats, setCats] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const reload = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('categories')
        .select('id,name');
      if (error) throw error;
      const list = (data as Category[]) ?? [];
      setCats(list);
      return list;
    } catch (e) {
      console.error(e);
      toast.error(t('category_select.loadError'));
      return [];
    } finally {
      setIsLoading(false);
    }
  }, [t, toast]);

  const createCategory = useCallback(
    async (name: string) => {
      if (!name || isCreating) return null;
      setIsCreating(true);
      try {
        const { data, error } = await supabase
          .from('categories')
          .insert({ name })
          .select('id,name')
          .single();
        if (error) throw error;
        await reload();
        return data as Category;
      } catch (e) {
        console.error(e);
        toast.error(t('category_select.createError'));
        return null;
      } finally {
        setIsCreating(false);
      }
    },
    [reload, t, isCreating, toast],
  );

  const deleteCategory = useCallback(
    async (id: string) => {
      if (!id || isDeleting) return false;
      setIsDeleting(true);
      try {
        // Deleting a category cascades (item_categories -> orphan-item
        // deletion -> items) through DB triggers, which can only ever
        // remove storage.objects metadata, not the underlying bytes. Find
        // the items this deletion would orphan and clean up their images
        // client-side first, same as a direct item delete.
        const { data: links, error: linksError } = await supabase
          .from('item_categories')
          .select('item_id')
          .eq('category_id', id);
        if (linksError) throw linksError;

        const itemIds = Array.from(
          new Set((links ?? []).map((l) => l.item_id)),
        );
        let orphanedItemIds = itemIds;
        if (itemIds.length) {
          const { data: stillLinked, error: linkedError } = await supabase
            .from('item_categories')
            .select('item_id')
            .in('item_id', itemIds)
            .neq('category_id', id);
          if (linkedError) throw linkedError;
          const keep = new Set((stillLinked ?? []).map((l) => l.item_id));
          orphanedItemIds = itemIds.filter((itemId) => !keep.has(itemId));
        }

        await Promise.all(
          orphanedItemIds.map((itemId) => removeItemImages(itemId)),
        );

        const { error } = await supabase
          .from('categories')
          .delete()
          .eq('id', id);
        if (error) throw error;
        await reload();
        return true;
      } catch (e) {
        console.error(e);
        toast.error(t('category_select.deleteError'));
        return false;
      } finally {
        setIsDeleting(false);
      }
    },
    [reload, t, isDeleting, toast],
  );

  return {
    cats,
    isLoading,
    isCreating,
    isDeleting,
    reload,
    createCategory,
    deleteCategory,
  };
}
