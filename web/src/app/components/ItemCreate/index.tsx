'use client';

import { useCallback, useState } from 'react';
import dynamic from 'next/dynamic';

import { useI18n } from '../../i18n/useI18n';
import { EMPTY_ITEM_FORM_VALUES, ItemFormValues } from '../ItemForm/types';
import { useCreateItem } from './useCreateItem';
import { Props } from './types';

// Split from the main bundle: PlaceAutocomplete's geocoder and its deps are
// dead weight on every page load that never opens this form.
const ItemForm = dynamic(() => import('../ItemForm'), { ssr: false });

export default function ItemCreate({
  categoryId,
  onCreated,
  onDirtyChange,
}: Props) {
  const { t } = useI18n();
  const [formKey, setFormKey] = useState(0);
  const { create, isCreating } = useCreateItem(categoryId);

  const handleCreate = useCallback(
    async (values: ItemFormValues) => {
      const ok = await create(values);
      if (!ok) return;
      onCreated();
      setFormKey((k) => k + 1);
    },
    [create, onCreated],
  );

  return (
    <section className="relative p-4 sm:p-5 space-y-3">
      <ItemForm
        key={formKey}
        initial={EMPTY_ITEM_FORM_VALUES}
        submitting={isCreating}
        submitLabel={t('item_create.add')}
        onSubmit={(values) => void handleCreate(values)}
        onDirtyChange={onDirtyChange}
      />
    </section>
  );
}
