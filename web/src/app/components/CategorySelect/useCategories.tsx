'use client';

import { useCallback, useState } from 'react';

import { useI18n } from '../../i18n/useI18n';
import { restoreAt } from '../../lib/optimistic';
import { useRequestSequence } from '../../lib/useRequestSequence';
import { useToast } from '../Toast/ToastProvider';
import { isQuotaExceeded } from '../../data/quota';
import {
  createCategory as createCategoryRow,
  deleteCategory as deleteCategoryRow,
  listCategories,
  listItemIdsForCategory,
  listItemIdsLinkedElsewhere,
  renameCategory as renameCategoryRow,
} from '../../data/categories';
import { listImagePathsForItems } from '../../data/images';
import { objectPathsOf, removeObjectsThenRows } from '../../data/imageRemoval';
import type { CategorySummary } from '../../data/categories';

export type UseCategories = ReturnType<typeof useCategories>;

// Owned by the page, which decides what renders below the strip once the categories have arrived.
export function useCategories() {
  const { t } = useI18n();
  const toast = useToast();
  const [categories, setCategories] = useState<CategorySummary[]>([]);
  // Starts true: an initial false flashed the "no categories" state before the first fetch.
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  // Every auth event reloads, in no guaranteed order; gated so an older response never clobbers a newer one.
  const { next, isCurrent } = useRequestSequence();

  const reload = useCallback(async () => {
    const mySequence = next();
    setIsLoading(true);
    try {
      const { data, error } = await listCategories();
      if (error) throw error;
      const list = data ?? [];
      if (isCurrent(mySequence)) setCategories(list);
      return list;
    } catch (error) {
      // Logged even for a superseded request; only the toast is gated.
      console.error(error);
      if (isCurrent(mySequence)) toast.error(t('category_select.load_error'));
      return [];
    } finally {
      if (isCurrent(mySequence)) setIsLoading(false);
    }
  }, [t, toast, next, isCurrent]);

  const createCategory = useCallback(
    async (name: string) => {
      if (!name || isCreating) return null;
      setIsCreating(true);
      try {
        const { data, error } = await createCategoryRow(name);
        if (error) throw error;
        await reload();
        return data;
      } catch (error) {
        toast.reportError(
          'create category',
          error,
          isQuotaExceeded(error)
            ? t('category_select.create_quota_error')
            : t('category_select.create_error'),
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
        // Merge the row the DB returned, not the value sent: a trigger normalises the name.
        setCategories((previous) =>
          previous.map((category) =>
            category.id === id ? { ...category, ...data } : category,
          ),
        );
        toast.success(t('category_select.rename_success'));
        return true;
      } catch (error) {
        toast.reportError(
          'rename category',
          error,
          t('category_select.rename_error'),
        );
        return false;
      } finally {
        setIsRenaming(false);
      }
    },
    [t, isRenaming, toast],
  );

  // Shared with useCategoryRemoval's onLeave, which needs the same optimistic hide for a share removal.
  const optimisticRemove = useCallback(
    (id: string): (() => void) | null => {
      const index = categories.findIndex((category) => category.id === id);
      const snapshot = categories[index];
      if (!snapshot) return null;
      setCategories((previous) =>
        previous.filter((category) => category.id !== id),
      );
      return () =>
        setCategories((previous) =>
          restoreAt({ list: previous, index, item: snapshot }),
        );
    },
    [categories],
  );

  const deleteCategory = useCallback(
    (id: string, options?: { onRestore?: () => void }) => {
      if (!id || isDeleting) return;
      const restore = optimisticRemove(id);
      if (!restore) return;
      const restoreAndNotify = () => {
        restore();
        options?.onRestore?.();
      };

      toast.success(t('category_select.delete_success'), {
        action: { label: t('common.undo'), onClick: restoreAndNotify },
        onExpire: async () => {
          setIsDeleting(true);
          try {
            // Which items the delete orphans must be read before the row goes: the cascade takes item_categories.
            const { data: links, error: linksError } =
              await listItemIdsForCategory(id);
            if (linksError) {
              throw new Error('Could not list items for category', {
                cause: linksError,
              });
            }

            const itemIds = Array.from(new Set(links ?? []));
            let orphanedItemIds = itemIds;
            if (itemIds.length) {
              const { data: stillLinked, error: linkedError } =
                await listItemIdsLinkedElsewhere({
                  itemIds,
                  excludingCategoryId: id,
                });
              if (linkedError) {
                // An incomplete answer must abort the whole delete, not read as "nothing else links these".
                throw new Error('Could not check items linked elsewhere', {
                  cause: linkedError,
                });
              }
              const keep = new Set(stillLinked);
              orphanedItemIds = itemIds.filter((itemId) => !keep.has(itemId));
            }

            // Read before the row delete: the cascade would drop these rows and the paths with them.
            let orphanedPaths: string[] = [];
            if (orphanedItemIds.length) {
              const listed = await listImagePathsForItems(orphanedItemIds);
              if (listed.error !== null) {
                throw new Error('Could not read images for orphaned items', {
                  cause: listed.error,
                });
              }
              const orphaned = new Set(orphanedItemIds);
              orphanedPaths = listed.data
                .filter((row) => orphaned.has(row.item_id))
                .flatMap(objectPathsOf);
            }

            const { error } = await removeObjectsThenRows({
              paths: orphanedPaths,
              deleteRows: () => deleteCategoryRow(id),
            });
            if (error) throw error;
            await reload();
          } catch (error) {
            toast.reportError(
              'delete category',
              error,
              t('category_select.delete_error'),
            );
            restoreAndNotify();
          } finally {
            setIsDeleting(false);
          }
        },
      });
    },
    [isDeleting, optimisticRemove, reload, t, toast],
  );

  return {
    categories,
    isLoading,
    isCreating,
    isDeleting,
    isRenaming,
    reload,
    createCategory,
    renameCategory,
    deleteCategory,
    optimisticRemove,
  };
}
