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
      const title = values.title.trim();
      const description = values.description.trim() || null;
      const place = values.place.trim() || null;
      const tags = Array.isArray(values.tags) ? values.tags : [];

      if (!title) return false;

      setIsCreating(true);
      let itemId: string | null = null;
      try {
        const { data, error } = await supabase
          .from('items')
          .insert({ title, description, place, tags })
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
        // Compensate orphan item if linking failed after insert
        if (itemId) {
          await supabase.from('items').delete().eq('id', itemId);
        }
        console.error(e);
        alert(t('item_list.no_user_session')); // reuse an existing key or add a specific one like 'item_create.createError'
        return false;
      } finally {
        setIsCreating(false);
      }
    },
    [categoryId, isCreating, t],
  );

  return { create, isCreating };
}
