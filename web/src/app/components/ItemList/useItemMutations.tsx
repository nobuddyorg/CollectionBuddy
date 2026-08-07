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

// Edit and delete, the two mutations an already-loaded entry can undergo --
// separated from the component tree so a save or a delete is not redefined,
// and its toast/rollback trio rebuilt, on every render the list itself
// triggers (an image-signature refresh, a page change).
export function useItemMutations({
  items,
  setItems,
  reload,
  deleteAllItemImages,
}: {
  items: ItemLite[];
  setItems: Dispatch<SetStateAction<ItemLite[]>>;
  reload: (opts?: { silent?: boolean }) => Promise<void>;
  deleteAllItemImages: (itemId: string) => Promise<void>;
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
        // The DB is the normalization authority (trims, collapses
        // whitespace, dedupes/sorts tags) -- send raw values and merge the
        // row it returns, rather than re-deriving a client-side copy that
        // can diverge from it.
        const { data, error } = await updateItem(id, values);
        if (error || !data) {
          console.error('Failed to save item:', error);
          toast.error(t('item_list.save_error'));
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

  // The card goes the moment the deletion is confirmed, and the work runs
  // behind it. Deleting used to hold the card on screen through five
  // sequential round trips -- and clear its image state partway through, so
  // it sat there as a photoless shell before finally vanishing on a full
  // page refetch (#238). Nothing about that wait was informative: the
  // outcome is almost always success, and the one thing the user wants to
  // see is the card gone.
  //
  // Failure puts it back where it was rather than leaving a card the
  // database still has silently missing from the grid.
  const removeItem = useCallback(
    async (id: string) => {
      if (!(await confirm(t('item_list.confirm_delete')))) return;

      // Captured before the optimistic removal, from the rendered list
      // rather than inside the state updater -- updaters can run more than
      // once.
      const index = items.findIndex((it) => it.id === id);
      const snapshot = items[index];
      setItems((prev) => prev.filter((it) => it.id !== id));

      const restore = () => {
        if (!snapshot) return;
        setItems((prev) => restoreAt(prev, index, snapshot));
      };

      // The row before the objects: the storage prefix is keyed by the
      // item's id, not derived from the row itself, so nothing is lost by
      // deleting it last. Deleting the row first also means a failure here
      // still means "nothing happened" -- the restore is honest, and no
      // photograph is ever destroyed on a path that reports itself as
      // failed.
      const { error } = await deleteItem(id);
      if (error) {
        console.error('Failed to delete item:', error);
        toast.error(t('item_list.delete_error'));
        restore();
        return;
      }

      // The card is already gone from the grid, and for anyone not looking
      // at it right now (or focused on it -- see #293) this is the only
      // evidence the deletion happened at all.
      toast.announce(t('item_list.entry_deleted'));

      try {
        // The row is already gone at this point, irreversibly. A failure
        // here is a storage leak, not data loss -- there is no entry left
        // to restore, and nothing to gain by pretending otherwise.
        await deleteAllItemImages(id);
      } catch (err) {
        console.error('Failed to delete item images:', err);
        toast.error(t('item_list.delete_images_cleanup_error'));
      }
      // Resyncs the page silently: pulls up whatever item now belongs in
      // the freed slot and corrects the total the pagination is drawn from.
      void reload({ silent: true });
    },
    [items, setItems, confirm, t, toast, deleteAllItemImages, reload],
  );

  return { saveEdit, isSaving, removeItem };
}
