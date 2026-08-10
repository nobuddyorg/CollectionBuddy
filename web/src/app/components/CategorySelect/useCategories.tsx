'use client';

import { useCallback, useRef, useState } from 'react';

import { useI18n } from '../../i18n/useI18n';
import { useToast } from '../Toast/ToastProvider';
import {
  createCategory as createCategoryRow,
  deleteCategory as deleteCategoryRow,
  listCategories,
  listItemIdsForCategory,
  listItemIdsLinkedElsewhere,
  renameCategory as renameCategoryRow,
} from '../../data/categories';
import { removeItemImages } from '../../data/images';
import type { CategorySummary } from '../../data/categories';

export type UseCategories = ReturnType<typeof useCategories>;

// Owned by the page rather than by CategorySelect: the page decides what
// to render below the strip, and "the categories haven't arrived yet" is
// the difference between an empty-state prompt and a placeholder grid.
export function useCategories() {
  const { t } = useI18n();
  const toast = useToast();
  const [cats, setCats] = useState<CategorySummary[]>([]);
  // Starts loading: the only consumer fetches on mount, and an initial
  // `false` meant the tab strip rendered its "no categories" state for a
  // render before the request it is waiting on had even started.
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  // `reload` is called for every auth event (INITIAL_SESSION,
  // TOKEN_REFRESHED, tab focus) with no guarantee those listings resolve in
  // the order they were sent -- gated the same way useItems guards `load`,
  // so a slower, older response can never clobber a newer one's result.
  const reqSeq = useRef(0);

  const reload = useCallback(async () => {
    const mySeq = ++reqSeq.current;
    setIsLoading(true);
    try {
      const { data, error } = await listCategories();
      if (error) throw error;
      const list = data ?? [];
      if (mySeq === reqSeq.current) setCats(list);
      return list;
    } catch (e) {
      console.error(e);
      if (mySeq === reqSeq.current)
        toast.error(t('category_select.load_error'));
      return [];
    } finally {
      if (mySeq === reqSeq.current) setIsLoading(false);
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
        toast.reportError(
          'create category',
          e,
          t('category_select.create_error'),
        );
        return null;
      } finally {
        setIsCreating(false);
      }
    },
    [reload, t, isCreating, toast],
  );

  const renameCategory = useCallback(
    async (id: string, name: string) => {
      const trimmed = name.trim();
      if (!id || !trimmed || isRenaming) return false;
      setIsRenaming(true);
      try {
        const { data, error } = await renameCategoryRow(id, trimmed);
        if (error) throw error;
        // Merge the row the DB returned rather than the value sent -- a
        // trigger normalises the name before it lands.
        if (data) {
          setCats((prev) =>
            prev.map((c) => (c.id === id ? { ...c, ...data } : c)),
          );
        }
        toast.success(t('category_select.rename_success'));
        return true;
      } catch (e) {
        toast.reportError(
          'rename category',
          e,
          t('category_select.rename_error'),
        );
        return false;
      } finally {
        setIsRenaming(false);
      }
    },
    [t, isRenaming, toast],
  );

  const deleteCategory = useCallback(
    async (id: string) => {
      if (!id || isDeleting) return false;
      setIsDeleting(true);
      try {
        // Deleting a category cascades (item_categories -> orphan-item
        // deletion -> items) through DB triggers, which can only ever
        // remove storage.objects metadata, not the underlying bytes. Work
        // out which items this deletion would orphan *before* the row is
        // gone -- the cascade takes item_categories with it, so this is
        // the last point those links can still be read.
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

        // The row before the bytes: the storage prefix is keyed by each
        // item's id, not derived from the row itself, so nothing is lost
        // by deleting it last. Deleting the row first also means a
        // failure here still means "nothing happened" -- no photograph is
        // ever destroyed on a path that reports itself as failed (#306),
        // same as a direct item delete.
        const { error } = await deleteCategoryRow(id);
        if (error) throw error;
        await reload();

        if (orphanedItemIds.length) {
          // The row is already gone at this point, irreversibly. A
          // failure here is a storage leak, not data loss -- there is no
          // category left to restore, and nothing to gain by letting one
          // item's failure stop the rest from being attempted, so every
          // removal runs to completion rather than aborting on the first
          // rejection.
          const results = await Promise.allSettled(
            orphanedItemIds.map((itemId) => removeItemImages(itemId)),
          );
          const failures = results.filter(
            (r): r is PromiseRejectedResult => r.status === 'rejected',
          );
          if (failures.length) {
            failures.forEach((f) =>
              console.error('Failed to clean up category images:', f.reason),
            );
            toast.error(t('category_select.delete_images_cleanup_error'));
          }
        }

        toast.success(t('category_select.delete_success'));
        return true;
      } catch (e) {
        toast.reportError(
          'delete category',
          e,
          t('category_select.delete_error'),
        );
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
    isRenaming,
    reload,
    createCategory,
    renameCategory,
    deleteCategory,
  };
}
