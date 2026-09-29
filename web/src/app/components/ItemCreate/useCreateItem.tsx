'use client';

import { useCallback, useState } from 'react';

import { useI18n } from '../../i18n/useI18n';
import { useToast } from '../Toast/ToastProvider';
import { createItemsInCategory } from '../../data/items';
import { isQuotaExceeded } from '../../data/quota';
import type { ItemFormValues } from '../ItemForm';

export function useCreateItem(categoryId: string) {
  const { t } = useI18n();
  const toast = useToast();
  const [isCreating, setIsCreating] = useState(false);

  const create = useCallback(
    async (values: ItemFormValues): Promise<boolean> => {
      if (isCreating) return false;
      // The DB normalizes everything else; only a blank title is worth refusing client-side.
      if (!values.title.trim()) return false;

      setIsCreating(true);
      try {
        const { error } = await createItemsInCategory(categoryId, [values]);
        if (error) throw error;

        toast.announce(t('item_create.entry_added'));
        return true;
      } catch (error) {
        toast.reportError(
          'create item',
          error,
          isQuotaExceeded(error)
            ? t('item_create.quota_error')
            : t('item_create.save_error'),
        );
        return false;
      } finally {
        setIsCreating(false);
      }
    },
    [categoryId, isCreating, t, toast],
  );

  return { create, isCreating };
}
