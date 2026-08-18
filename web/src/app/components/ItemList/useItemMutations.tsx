'use client';

import { useCallback, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';

import { deleteItem, updateItem } from '../../data/items';
import { useI18n } from '../../i18n/useI18n';
import { useToast } from '../Toast/ToastProvider';
import { useConfirm } from '../Confirm/ConfirmProvider';
import type { ItemFormValues } from '../ItemForm';
import { restoreAt } from './optimistic';
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
   * (0013_images.sql). */
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

  // The card goes the moment deletion is confirmed; the work runs behind
  // it. Failure puts it back where it was rather than leaving a card the
  // database still has silently missing from the grid.
  const removeItem = useCallback(
    async (id: string) => {
      if (!(await confirm(t('item_list.confirm_delete')))) return;

      // From the rendered list, not inside the state updater -- updaters
      // can run more than once.
      const index = items.findIndex((it) => it.id === id);
      const snapshot = items[index];
      setItems((prev) => prev.filter((it) => it.id !== id));

      const restore = () => {
        if (!snapshot) return;
        setItems((prev) => restoreAt(prev, index, snapshot));
      };

      // Must run before deleteItem: once the item row is gone, its images
      // rows cascade away with it (0013_images.sql) -- this is the last
      // point their paths can be read.
      const imagePaths = await captureItemImagePaths(id);

      // The row before the objects: if this fails, nothing happened yet
      // and the restore above is honest.
      const { error } = await deleteItem(id);
      if (error) {
        toast.reportError('delete item', error, t('item_list.delete_error'));
        restore();
        return;
      }

      toast.success(t('item_list.entry_deleted'));

      try {
        // Row already gone here. A failure below is a storage leak, not
        // data loss.
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
    [
      items,
      setItems,
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
