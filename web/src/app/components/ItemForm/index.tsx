'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useI18n } from '../../i18n/useI18n';
import Icon, { IconType } from '../Icon';
import { PlaceAutocomplete } from './PlaceAutocomplete';
import { Submit } from './Submit';
import { TagsInput } from './TagsInput';
import type { ItemFormProps, ItemFormValues } from './types';

export type { ItemFormValues } from './types';

export default function ItemForm({
  initial,
  submitting = false,
  submitLabel,
  onSubmit,
  onCancel,
  showIconSubmit = false,
}: ItemFormProps) {
  const { t } = useI18n();

  const [title, setTitle] = useState(initial.title ?? '');
  const [description, setDescription] = useState(initial.description ?? '');
  const [place, setPlace] = useState(initial.place ?? '');
  const [tags, setTags] = useState<string[]>(initial.tags ?? []);

  useEffect(() => {
    setTitle(initial.title ?? '');
    setDescription(initial.description ?? '');
    setPlace(initial.place ?? '');
    setTags(initial.tags ?? []);
  }, [initial]);

  const canSubmit = useMemo(() => !!title.trim(), [title]);
  const isEditMode = typeof onCancel === 'function';

  const renderIcon = () =>
    isEditMode ? (
      <Icon
        icon={IconType.Check}
        className="w-5 h-5"
        aria-hidden="true"
        stroke="currentColor"
        strokeWidth="2"
        fill="none"
      />
    ) : (
      <Icon
        icon={IconType.Plus}
        className="w-6 h-6"
        stroke="currentColor"
        strokeWidth="2"
        fill="none"
      />
    );

  const submitNow = useCallback(() => {
    if (!canSubmit) return;
    onSubmit({ title, description, place, tags } as ItemFormValues);
  }, [canSubmit, onSubmit, title, description, place, tags]);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <input
          aria-label={t('item_create.title')}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && canSubmit && submitNow()}
          placeholder={t('item_create.title')}
          className="rounded-xl border px-3 py-2 bg-card/60 dark:bg-card/70 outline-none focus:border-primary dark:focus:border-primary"
        />
        <input
          aria-label={t('item_create.description')}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && canSubmit && submitNow()}
          placeholder={t('item_create.description')}
          className="rounded-xl border px-3 py-2 bg-card/60 dark:bg-card/70 outline-none focus:border-primary dark:focus:border-primary"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <PlaceAutocomplete value={place} onChange={setPlace} />
        <TagsInput tags={tags} setTags={setTags} />
      </div>

      <div className="flex justify-end gap-2">
        {onCancel && !showIconSubmit && (
          <button
            type="button"
            onClick={onCancel}
            className="h-9 px-3 rounded-xl border shadow-sm hover:bg-muted/50"
          >
            {t('item_list.close_modal')}
          </button>
        )}

        {showIconSubmit ? (
          <button
            type="button"
            disabled={submitting || !canSubmit}
            onClick={submitNow}
            className="w-10 h-10 rounded-xl bg-primary text-primary-foreground shadow-sm hover:brightness-110 active:scale-[0.99] disabled:opacity-60 flex items-center justify-center"
            title={submitLabel}
          >
            {submitting ? (
              <div className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            ) : (
              renderIcon()
            )}
          </button>
        ) : (
          <Submit
            submitting={submitting}
            disabled={submitting || !canSubmit}
            label={submitLabel}
            iconMode={false}
            onClick={submitNow}
          />
        )}
      </div>
    </div>
  );
}
