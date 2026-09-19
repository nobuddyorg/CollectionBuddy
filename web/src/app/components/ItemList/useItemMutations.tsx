'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';

import { deleteItem, updateItem } from '../../data/items';
import { useI18n } from '../../i18n/useI18n';
import { useToast } from '../Toast/ToastProvider';
import { useConfirm } from '../Confirm/ConfirmProvider';
import { restoreAt } from '../../lib/optimistic';
import type { ItemFormValues } from '../ItemForm';
import type { ItemLite } from './types';

// Separated from the component tree so save/delete aren't redefined on
// every render the list triggers for unrelated reasons.
export function useItemMutations({
  items,
  setItems,
  reload,
  captureItemImagePaths,
  removeImageBytes,
}: {
  items: ItemLite[];
  setItems: Dispatch<SetStateAction<ItemLite[]>>;
  reload: (opts?: { silent?: boolean }) => Promise<void>;
  /** Read-only: the item's photograph paths, captured before `deleteItem`
   * -- the images rows they name are gone once the item row cascades away
   * (0003_tables.sql). */
  captureItemImagePaths: (
    itemId: string,
  ) => Promise<{ path_full: string; path_thumb: string | null }[]>;
  removeImageBytes: (
    itemId: string,
    paths: { path_full: string; path_thumb: string | null }[],
  ) => Promise<void>;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const confirm = useConfirm();
  const [isSaving, setIsSaving] = useState(false);
  // Ids whose deletion is confirmed but not yet actually run -- the real
  // deleteItem() call is deferred to the toast's undo window (see below).
  // A reload can land in that window (e.g. the search box clearing right
  // after the confirm click) and report the row exactly as the database
  // still has it, which would otherwise resurrect a card the user just
  // watched disappear.
  const pendingDeleteIds = useRef<Set<string>>(new Set());

  // The one place that strips pending-delete ids out of a list -- shared
  // between the click's own optimistic removal and the effect below, so
  // there is a single implementation, not two that happen to agree. The
  // reference-equality return isn't just an optimization: the effect is
  // keyed on `items`, so an updater that always returns a new array would
  // re-trigger itself forever.
  const excludePendingDeletes = useCallback((list: ItemLite[]) => {
    const next = list.filter((it) => !pendingDeleteIds.current.has(it.id));
    return next.length === list.length ? list : next;
  }, []);

  // Reconciles `items` against pendingDeleteIds on every change, not just
  // the one removeItem makes itself -- a reload landing in the undo window
  // above is exactly such a change, and needs the same treatment.
  useEffect(() => {
    setItems(excludePendingDeletes);
  }, [items, setItems, excludePendingDeletes]);

  const saveEdit = useCallback(
    async (id: string, values: ItemFormValues): Promise<boolean> => {
      if (isSaving) return false;
      setIsSaving(true);
      try {
        // The DB is the normalization authority -- merge the row it
        // returns rather than re-deriving a client-side copy.
        const { data, error } = await updateItem(id, values);
        if (error || !data) {
          toast.reportError('save item', error, t('item_list.save_error'));
          return false;
        }
        setItems((prev) =>
          prev.map((it) => (it.id === id ? { ...it, ...data } : it)),
        );
        toast.announce(t('item_list.changes_saved'));
        return true;
      } finally {
        setIsSaving(false);
      }
    },
    [isSaving, setItems, t, toast],
  );

  // The card goes the moment deletion is confirmed; the actual delete is
  // deferred to the toast's undo window (see useToast). Failure or undo
  // puts it back where it was rather than leaving a card the database
  // still has silently missing from the grid.
  const removeItem = useCallback(
    async (id: string) => {
      if (!(await confirm(t('item_list.confirm_delete')))) return;

      // From the rendered list, not inside the state updater -- updaters
      // can run more than once.
      const index = items.findIndex((it) => it.id === id);
      const snapshot = items[index];
      pendingDeleteIds.current.add(id);
      setItems(excludePendingDeletes);

      const restore = () => {
        pendingDeleteIds.current.delete(id);
        if (!snapshot) return;
        setItems((prev) => restoreAt(prev, index, snapshot));
      };

      toast.success(t('item_list.entry_deleted'), {
        action: { label: t('common.undo'), onClick: restore },
        onExpire: async () => {
          // Must run before deleteItem: once the item row is gone, its
          // images rows cascade away with it (0003_tables.sql) -- this is
          // the last point their paths can be read.
          const imagePaths = await captureItemImagePaths(id);

          // The row before the objects: if this fails, nothing happened
          // yet and the restore above is honest.
          const { error } = await deleteItem(id);
          if (error) {
            toast.reportError(
              'delete item',
              error,
              t('item_list.delete_error'),
            );
            restore();
            return;
          }

          try {
            // Row already gone here. A failure below is a storage leak,
            // not data loss.
            await removeImageBytes(id, imagePaths);
          } catch (err) {
            toast.reportError(
              'delete item images',
              err,
              t('item_list.delete_images_cleanup_error'),
            );
          }
          void reload({ silent: true });
        },
      });
    },
    [
      items,
      setItems,
      excludePendingDeletes,
      confirm,
      t,
      toast,
      captureItemImagePaths,
      removeImageBytes,
      reload,
    ],
  );

  return { saveEdit, isSaving, removeItem };
}
