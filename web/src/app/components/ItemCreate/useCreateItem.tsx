'use client';

import { useCallback, useState } from 'react';

import { useI18n } from '../../i18n/useI18n';
import { useToast } from '../Toast/ToastProvider';
import { createItemsInCategory } from '../../data/items';
import { geocodeOnce, photonLang } from '../../data/photon';
import { isQuotaExceeded } from '../../data/quota';
import type { ItemFormValues } from '../ItemForm';
import { withLocatedPlace } from '../ItemForm/locatePlace';

export function useCreateItem(categoryId: string) {
  const { t, language } = useI18n();
  const toast = useToast();
  const [isCreating, setIsCreating] = useState(false);

  const create = useCallback(
    async (values: ItemFormValues): Promise<boolean> => {
      if (isCreating) return false;
      // The DB normalizes everything else; only a blank title is worth refusing client-side.
      if (!values.title.trim()) return false;

      setIsCreating(true);
      try {
        // Before the one write, not after: the RPC returns no id to write coordinates back to.
        const located = await withLocatedPlace(values, (place) =>
          geocodeOnce(place, { lang: photonLang(language) }),
        );
        const { error } = await createItemsInCategory(categoryId, [located]);
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
    [categoryId, isCreating, language, t, toast],
  );

  return { create, isCreating };
}
