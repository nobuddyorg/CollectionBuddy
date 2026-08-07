'use client';

import CenteredModal from '../CenteredModal';
import ItemForm, { ItemFormValues } from '../ItemForm';
import { useI18n } from '../../i18n/useI18n';
import type { ItemLite } from './types';

const EMPTY_VALUES: ItemFormValues = {
  title: '',
  description: '',
  place: '',
  place_lat: null,
  place_lng: null,
  tags: [],
};

// The entry passed in is a snapshot taken when the card's edit button was
// pressed, not a live lookup by id -- so what the form opens onto cannot
// shift out from under the user if the underlying list changes while the
// modal is up.
function valuesFor(item: ItemLite | null): ItemFormValues {
  if (!item) return EMPTY_VALUES;
  return {
    title: item.title,
    description: item.description ?? '',
    place: item.place ?? '',
    // Round-tripped rather than dropped: the form only replaces these when
    // the place field itself is edited, so an item edited for any other
    // reason keeps the pin it already had.
    place_lat: item.place_lat,
    place_lng: item.place_lng,
    tags: item.tags ?? [],
  };
}

export function EditItemModal({
  open,
  item,
  isSaving,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  item: ItemLite | null;
  isSaving: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: ItemFormValues) => void;
}) {
  const { t } = useI18n();

  return (
    <CenteredModal
      open={open}
      onOpenChange={onOpenChange}
      title={t('item_list.edit_item')}
      closeLabel={t('common.close')}
    >
      <section className="relative z-[50]">
        <ItemForm
          key={item?.id}
          initial={valuesFor(item)}
          submitLabel={t('common.save')}
          submitting={isSaving}
          onSubmit={onSubmit}
          onCancel={() => onOpenChange(false)}
        />
      </section>
    </CenteredModal>
  );
}
