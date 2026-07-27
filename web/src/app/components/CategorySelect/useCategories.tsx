'use client';

import { useCallback, useState } from 'react';

import { useI18n } from '../../i18n/useI18n';
import { useToast } from '../Toast/ToastProvider';
import {
  createCategory as createCategoryRow,
  deleteCategory as deleteCategoryRow,
  listCategories,
  listItemIdsForCategory,
  listItemIdsLinkedElsewhere,
} from '../../data/categories';
import { removeItemImages } from '../../data/images';
import type { CategorySummary } from '../../data/categories';

export function useCategories() {
  const { t } = useI18n();
  const toast = useToast();
  const [cats, setCats] = useState<CategorySummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const reload = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data, error } = await listCategories();
      if (error) throw error;
      const list = data ?? [];
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
        const { data, error } = await createCategoryRow(name);
        if (error) throw error;
        await reload();
        return data;
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
        const { data: links, error: linksError } =
          await listItemIdsForCategory(id);
        if (linksError) throw linksError;

        const itemIds = Array.from(
          new Set((links ?? []).map((l) => l.item_id)),
        );
        let orphanedItemIds = itemIds;
        if (itemIds.length) {
          const { data: stillLinked, error: linkedError } =
            await listItemIdsLinkedElsewhere(itemIds, id);
          if (linkedError) throw linkedError;
          const keep = new Set((stillLinked ?? []).map((l) => l.item_id));
          orphanedItemIds = itemIds.filter((itemId) => !keep.has(itemId));
        }

        await Promise.all(
          orphanedItemIds.map((itemId) => removeItemImages(itemId)),
        );

        const { error } = await deleteCategoryRow(id);
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
