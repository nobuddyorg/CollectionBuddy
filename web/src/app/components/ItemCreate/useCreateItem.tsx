'use client';

import { useCallback, useState } from 'react';

import { useI18n } from '../../i18n/useI18n';
import { supabase } from '../../supabase';
import type { ItemFormValues } from '../ItemForm';

export function useCreateItem(categoryId: string) {
  const { t } = useI18n();
  const [isCreating, setIsCreating] = useState(false);

  const create = useCallback(
    async (values: ItemFormValues): Promise<boolean> => {
      if (isCreating) return false;
      // The DB is the normalization authority (trims, collapses whitespace,
      // nullifies blanks, dedupes/sorts tags) -- only guard against an
      // obviously-blank title here so we don't submit for nothing.
      if (!values.title.trim()) return false;
      const tags = Array.isArray(values.tags) ? values.tags : [];

      setIsCreating(true);
      let itemId: string | null = null;
      try {
        const { data, error } = await supabase
          .from('items')
          .insert({
            title: values.title,
            description: values.description,
            place: values.place,
            tags,
          })
          .select('id')
          .single<{ id: string }>();

        if (error || !data) throw error ?? new Error('insert failed');
        itemId = data.id;

        const { error: linkError } = await supabase
          .from('item_categories')
          .insert({ item_id: itemId, category_id: categoryId });

        if (linkError) throw linkError;

        return true;
      } catch (e) {
        if (itemId) {
          await supabase.from('items').delete().eq('id', itemId);
        }
        console.error(e);
        alert(t('item_list.no_user_session'));
        return false;
      } finally {
        setIsCreating(false);
      }
    },
    [categoryId, isCreating, t],
  );

  return { create, isCreating };
}
