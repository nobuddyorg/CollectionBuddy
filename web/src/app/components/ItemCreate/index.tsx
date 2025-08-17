'use client';

import { useCallback, useState } from 'react';

import { useI18n } from '../../i18n/useI18n';
import ItemForm, { ItemFormValues } from '../ItemForm';
import { useCreateItem } from './useCreateItem';

type Props = {
  categoryId: string;
  onCreated: () => void;
};

export default function ItemCreate({ categoryId, onCreated }: Props) {
  const { t } = useI18n();
  const [formKey, setFormKey] = useState(0);
  const { create, isCreating } = useCreateItem(categoryId);

  const handleCreate = useCallback(
    async (values: ItemFormValues) => {
      const ok = await create(values);
      if (!ok) return;
      onCreated();
      setFormKey((k) => k + 1); // reset form
    },
    [create, onCreated],
  );

  return (
    <section className="relative z-[70] p-4 sm:p-5 space-y-3">
      <ItemForm
        key={formKey}
        initial={{ title: '', description: '', place: '', tags: [] }}
        submitting={isCreating}
        submitLabel={t('item_create.add')}
        onSubmit={handleCreate}
        showIconSubmit
      />
    </section>
  );
}
