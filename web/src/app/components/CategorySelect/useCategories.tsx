'use client';

import { useCallback, useState } from 'react';

import { useI18n } from '../../i18n/useI18n';
import { useRequestSequence } from '../../lib/useRequestSequence';
import { useToast } from '../Toast/ToastProvider';
import {
  createCategory as createCategoryRow,
  deleteCategory as deleteCategoryRow,
  listCategories,
  listItemIdsForCategory,
  listItemIdsLinkedElsewhere,
  renameCategory as renameCategoryRow,
} from '../../data/categories';
import { listImagePathsForItems, removeImageObjects } from '../../data/images';
import type { CategorySummary } from '../../data/categories';

export type UseCategories = ReturnType<typeof useCategories>;

// Owned by the page rather than by CategorySelect: the page decides what
// to render below the strip based on whether the categories have arrived
// yet.
export function useCategories() {
  const { t } = useI18n();
  const toast = useToast();
  const [cats, setCats] = useState<CategorySummary[]>([]);
  // Starts loading: an initial `false` meant the tab strip rendered its
  // "no categories" state for a render before the fetch had even started.
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  // `reload` is called for every auth event with no guarantee those
  // listings resolve in the order they were sent -- gated so a slower,
  // older response can never clobber a newer one's result.
  const { next, isCurrent } = useRequestSequence();

  const reload = useCallback(async () => {
    const mySeq = next();
    setIsLoading(true);
    try {
      const { data, error } = await listCategories();
      if (error) throw error;
      const list = data ?? [];
      if (isCurrent(mySeq)) setCats(list);
      return list;
    } catch (e) {
      // Logged unconditionally, unlike the toast below: still worth
      // knowing about even for a request a newer one has already
      // superseded, which is the only thing `isCurrent` is guarding here.
      console.error(e);
      if (isCurrent(mySeq)) toast.error(t('category_select.load_error'));
      return [];
    } finally {
      if (isCurrent(mySeq)) setIsLoading(false);
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
        // Merge the row the DB returned, not the value sent -- a trigger
        // normalises the name before it lands.
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
        // deletion -> items) through DB triggers, removing only
        // storage.objects metadata, not the underlying bytes. Work out
        // which items this deletion would orphan *before* the row is
        // gone -- the cascade takes item_categories with it, so this is
        // the last point those links can still be read.
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
            await listItemIdsLinkedElsewhere(itemIds, id);
          if (linkedError) {
            // An incomplete answer here (a truncated page, a failed chunk)
            // must abort the whole deletion, including the category row
            // itself, rather than being treated as "nothing else links
            // these items" and silently orphaning the wrong photographs.
            throw new Error('Could not check items linked elsewhere', {
              cause: linkedError,
            });
          }
          const keep = new Set(stillLinked ?? []);
          orphanedItemIds = itemIds.filter((itemId) => !keep.has(itemId));
        }

        // Read-only, and must run before deleteCategoryRow below: once the
        // category row is gone, the cascade removes the orphaned items and
        // their images rows go with them (on delete cascade) -- this is
        // the last point their paths can still be read. One batched query
        // rather than one per item.
        //
        // Unlike listItemIdsLinkedElsewhere above, a failure here does not
        // abort the deletion: getting *that* wrong misclassifies which
        // items are orphaned at all, an active correctness bug. Getting
        // *this* wrong only means fewer paths to clean up afterward --
        // logged, not fatal to the category the user asked to delete.
        const orphanedImagePaths = new Map<
          string,
          { path_full: string; path_thumb: string | null }[]
        >();
        if (orphanedItemIds.length) {
          const { data: imageRows, error: imagesError } =
            await listImagePathsForItems(orphanedItemIds);
          if (imagesError) {
            console.error(
              'Could not read images for orphaned items:',
              imagesError,
            );
          }
          for (const row of imageRows ?? []) {
            const list = orphanedImagePaths.get(row.item_id) ?? [];
            list.push({ path_full: row.path_full, path_thumb: row.path_thumb });
            orphanedImagePaths.set(row.item_id, list);
          }
        }

        // The row before the bytes: deleting the category row first means
        // a failure here still means "nothing happened" -- no photograph
        // is ever destroyed on a path that reports itself as failed.
        // Capturing the paths above doesn't change that: it's a read, not
        // a mutation.
        const { error } = await deleteCategoryRow(id);
        if (error) throw error;
        await reload();

        if (orphanedItemIds.length) {
          // The row is already gone, irreversibly. A failure here is a
          // storage leak, not data loss, so every removal runs to
          // completion rather than aborting on the first rejection.
          const results = await Promise.allSettled(
            orphanedItemIds.map(async (itemId) => {
              const paths = orphanedImagePaths.get(itemId) ?? [];
              const flat = paths.flatMap((p) =>
                p.path_thumb ? [p.path_full, p.path_thumb] : [p.path_full],
              );
              if (!flat.length) return;
              const { error: removeError } = await removeImageObjects(flat);
              if (removeError) throw removeError;
            }),
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
