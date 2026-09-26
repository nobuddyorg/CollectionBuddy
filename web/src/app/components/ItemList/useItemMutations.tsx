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

export function useItemMutations({
  items,
  setItems,
  reload,
  captureItemImagePaths,
  removeImageBytes,
}: {
  items: ItemLite[];
  setItems: Dispatch<SetStateAction<ItemLite[]>>;
  reload: (options?: { silent?: boolean }) => Promise<void>;
  /** Read before `deleteItem`: the item row's cascade takes the images rows, and their paths, with it. */
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
  // Removed optimistically, deleted only after the undo window; kept out of `items` across a reload.
  const pendingDeleteIds = useRef<Set<string>>(new Set());

  // Returns the same reference when nothing changes, so the effect below can't loop.
  const excludePendingDeletes = useCallback((list: ItemLite[]) => {
    const next = list.filter((item) => !pendingDeleteIds.current.has(item.id));
    return next.length === list.length ? list : next;
  }, []);

  useEffect(() => {
    setItems(excludePendingDeletes);
  }, [items, setItems, excludePendingDeletes]);

  const saveEdit = useCallback(
    async (id: string, values: ItemFormValues): Promise<boolean> => {
      if (isSaving) return false;
      setIsSaving(true);
      try {
        // The DB is the normalization authority: merge the row it returns, not a client-side copy.
        const { data, error } = await updateItem(id, values);
        if (error || !data) {
          toast.reportError('save item', error, t('item_list.save_error'));
          return false;
        }
        setItems((previous) =>
          previous.map((item) =>
            item.id === id ? { ...item, ...data } : item,
          ),
        );
        toast.announce(t('item_list.changes_saved'));
        return true;
      } finally {
        setIsSaving(false);
      }
    },
    [isSaving, setItems, t, toast],
  );

  // The card goes on confirm; the delete runs once the toast's undo window closes, else it is restored.
  const removeItem = useCallback(
    async (id: string) => {
      if (!(await confirm(t('item_list.confirm_delete')))) return;

      // From the rendered list, not inside the state updater: updaters can run more than once.
      const index = items.findIndex((item) => item.id === id);
      const snapshot = items[index];
      pendingDeleteIds.current.add(id);
      setItems(excludePendingDeletes);

      const restore = () => {
        pendingDeleteIds.current.delete(id);
        if (!snapshot) return;
        setItems((previous) =>
          restoreAt({ list: previous, index, item: snapshot }),
        );
      };

      toast.success(t('item_list.entry_deleted'), {
        action: { label: t('common.undo'), onClick: restore },
        onExpire: async () => {
          try {
            // Objects before the row: the row's cascade takes the images rows, and their paths, with it.
            const imagePaths = await captureItemImagePaths(id);
            await removeImageBytes(id, imagePaths);
            const { error } = await deleteItem(id);
            if (error) throw error;
          } catch (error) {
            toast.reportError(
              'delete item',
              error,
              t('item_list.delete_error'),
            );
            restore();
            return;
          }
          // Awaited so sign-out, which waits on this commit, cannot clear the session under the refetch.
          await reload({ silent: true });
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
