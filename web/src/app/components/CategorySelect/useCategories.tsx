'use client';

import { useCallback, useState } from 'react';

import { useI18n } from '../../i18n/useI18n';
import { supabase } from '../../supabase';
import type { Category } from '../../types';

export function useCategories() {
  const { t } = useI18n();
  const [cats, setCats] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const reload = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('categories')
        .select('id,name');
      if (error) throw error;
      const list = (data as Category[]) ?? [];
      setCats(list);
      return list;
    } catch (e) {
      console.error(e);
      alert(t('category_select.loadError'));
      return [];
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  const createCategory = useCallback(
    async (name: string) => {
      if (!name || isCreating) return null;
      setIsCreating(true);
      try {
        const { data, error } = await supabase
          .from('categories')
          .insert({ name })
          .select('id,name')
          .single();
        if (error) throw error;
        await reload();
        return data as Category;
      } catch (e) {
        console.error(e);
        alert(t('category_select.createError'));
        return null;
      } finally {
        setIsCreating(false);
      }
    },
    [reload, t, isCreating],
  );

  const deleteCategory = useCallback(
    async (id: string) => {
      if (!id || isDeleting) return false;
      setIsDeleting(true);
      try {
        const { error } = await supabase
          .from('categories')
          .delete()
          .eq('id', id);
        if (error) throw error;
        await reload();
        return true;
      } catch (e) {
        console.error(e);
        alert(t('category_select.deleteError'));
        return false;
      } finally {
        setIsDeleting(false);
      }
    },
    [reload, t, isDeleting],
  );

  return {
    cats,
    isLoading,
    isCreating,
    isDeleting,
    reload,
    createCategory,
    deleteCategory,
  };
}
