'use client';
import { useCallback, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useI18n } from '../hooks/useI18n';
import ItemForm, { ItemFormValues } from '../components/ItemForm';

type PropsCreate = {
  categoryId: string;
  onCreated: () => void;
};

export default function ItemCreate({ categoryId, onCreated }: PropsCreate) {
  const { t } = useI18n();
  const [isCreating, setIsCreating] = useState(false);

  const handleCreate = useCallback(async (values: ItemFormValues) => {
    if (isCreating) return;
    setIsCreating(true);
    try {
      const { data, error } = await supabase
        .from('items')
        .insert({
          title: values.title.trim(),
          description: values.description.trim() || null,
          place: values.place.trim() || null,
          tags: values.tags,
        })
        .select('id')
        .single<{ id: string }>();
      if (error || !data) return;

      const { error: linkError } = await supabase
        .from('item_categories')
        .insert({ item_id: data.id, category_id: categoryId });
      if (linkError) return;

      onCreated();
    } finally {
      setIsCreating(false);
    }
  }, [categoryId, isCreating, onCreated]);

  return (
    <section className="p-4 sm:p-5 space-y-3 z-70 relative">
      <ItemForm
  initial={{ title: '', description: '', place: '', tags: [] }}
  submitting={isCreating}
  submitLabel={t('item_create.add')}
  onSubmit={handleCreate}
  showIconSubmit
/>

    </section>
  );
}
