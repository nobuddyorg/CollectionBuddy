'use client';

import { useCallback, useState } from 'react';
import dynamic from 'next/dynamic';

import CenteredModal from '../CenteredModal';
import { EMPTY_ITEM_FORM_VALUES, ItemFormValues } from '../ItemForm/types';
import { useI18n } from '../../i18n/useI18n';
import { useGuardedModalClose } from '../../lib/useGuardedModalClose';
import type { ItemLite } from './types';

// See ItemCreate/index.tsx: same form, same reason to split it out.
const ItemForm = dynamic(() => import('../ItemForm'), { ssr: false });

// The entry is a snapshot taken when edit was pressed, not a live lookup by
// id, so the form can't shift under the user if the list changes while the
// modal is open.
function valuesFor(item: ItemLite | null): ItemFormValues {
  if (!item) return EMPTY_ITEM_FORM_VALUES;
  return {
    title: item.title,
    description: item.description ?? '',
    place: item.place ?? '',
    // Round-tripped rather than dropped: only replaced when the place field
    // itself is edited, so other edits keep the existing pin.
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
  const [isDirty, setIsDirty] = useState(false);

  const close = useCallback(() => onOpenChange(false), [onOpenChange]);
  const discard = useCallback(() => setIsDirty(false), []);
  const guardedClose = useGuardedModalClose(isDirty, close, discard);

  return (
    <CenteredModal
      open={open}
      onOpenChange={(v) => (v ? undefined : guardedClose())}
      title={t('item_list.edit_item')}
      closeLabel={t('common.close')}
    >
      <section className="relative">
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
