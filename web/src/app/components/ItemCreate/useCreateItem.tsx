'use client';

import { useCallback, useState } from 'react';

import { useI18n } from '../../i18n/useI18n';
import { useToast } from '../Toast/ToastProvider';
import { createItem, deleteItem, linkItemToCategory } from '../../data/items';
import type { ItemFormValues } from '../ItemForm';

export function useCreateItem(categoryId: string) {
  const { t } = useI18n();
  const toast = useToast();
  const [isCreating, setIsCreating] = useState(false);

  const create = useCallback(
    async (values: ItemFormValues): Promise<boolean> => {
      if (isCreating) return false;
      // The DB normalizes everything else; only guard an obviously-blank
      // title here so we don't submit for nothing.
      if (!values.title.trim()) return false;
      const tags = Array.isArray(values.tags) ? values.tags : [];

      setIsCreating(true);
      let itemId: string | null = null;
      try {
        const { data, error } = await createItem({ ...values, tags });

        if (error || !data) throw error ?? new Error('insert failed');
        itemId = data.id;

        const { error: linkError } = await linkItemToCategory(
          itemId,
          categoryId,
        );

        if (linkError) throw linkError;

        toast.announce(t('item_create.entry_added'));
        return true;
      } catch (e) {
        if (itemId) {
          await deleteItem(itemId);
        }
        toast.reportError('create item', e, t('item_create.save_error'));
        return false;
      } finally {
        setIsCreating(false);
      }
    },
    [categoryId, isCreating, t, toast],
  );

  return { create, isCreating };
}
