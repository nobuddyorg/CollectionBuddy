'use client';

import { useCallback, useState } from 'react';

import CenteredModal from '../CenteredModal';
import ItemForm, { EMPTY_ITEM_FORM_VALUES, ItemFormValues } from '../ItemForm';
import { useConfirm } from '../Confirm/ConfirmProvider';
import { useI18n } from '../../i18n/useI18n';
import type { ItemLite } from './types';

// The entry passed in is a snapshot taken when the card's edit button was
// pressed, not a live lookup by id -- so what the form opens onto cannot
// shift out from under the user if the underlying list changes while the
// modal is up.
function valuesFor(item: ItemLite | null): ItemFormValues {
  if (!item) return EMPTY_ITEM_FORM_VALUES;
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
  const confirm = useConfirm();
  const [isDirty, setIsDirty] = useState(false);

  // The single path every dismissal goes through -- backdrop tap, Escape,
  // the dialog's own X, and the form's Cancel button all resolve to this
  // (see the wiring below), so a stray tap doesn't lose an edit any more
  // easily than tapping Cancel on purpose would (#308).
  const guardedClose = useCallback(() => {
    if (!isDirty) {
      onOpenChange(false);
      return;
    }
    void (async () => {
      if (await confirm(t('item_create.confirm_discard'))) {
        setIsDirty(false);
        onOpenChange(false);
      }
    })();
  }, [isDirty, confirm, onOpenChange, t]);

  return (
    <CenteredModal
      open={open}
      onOpenChange={(v) => (v ? undefined : guardedClose())}
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
          onCancel={guardedClose}
          onDirtyChange={setIsDirty}
        />
      </section>
    </CenteredModal>
  );
}
