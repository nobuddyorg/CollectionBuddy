'use client';

import { useCallback, useId, useRef, useState } from 'react';
import { useI18n } from '../../i18n/useI18n';
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

  // Callers reset the form by changing `key` (see ItemCreate and the edit
  // modal in ItemList), which remounts this component and reruns these
  // initializers. Resyncing on `initial` identity here too meant any
  // unrelated parent re-render — e.g. images finishing a signed-URL
  // refresh — cleared whatever the user had just typed.
  const [title, setTitle] = useState(initial.title ?? '');
  const [description, setDescription] = useState(initial.description ?? '');
  const [place, setPlace] = useState(initial.place ?? '');
  const [tags, setTags] = useState<string[]>(initial.tags ?? []);
  const [titleTouched, setTitleTouched] = useState(false);

  const titleId = useId();
  const descriptionId = useId();
  const placeId = useId();
  const tagsId = useId();
  const titleRef = useRef<HTMLInputElement>(null);

  const titleError = titleTouched && !title.trim();

  const handleSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (!title.trim()) {
        setTitleTouched(true);
        titleRef.current?.focus();
        return;
      }
      onSubmit({ title, description, place, tags } as ItemFormValues);
    },
    [onSubmit, title, description, place, tags],
  );

  return (
    <form className="space-y-3" onSubmit={handleSubmit} noValidate>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div className="space-y-1">
          <label
            htmlFor={titleId}
            className="text-xs font-medium text-muted-foreground"
          >
            {t('item_create.title')}
            <span aria-hidden="true"> *</span>
          </label>
          <input
            id={titleId}
            ref={titleRef}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => setTitleTouched(true)}
            required
            aria-required="true"
            aria-invalid={titleError}
            aria-describedby={titleError ? `${titleId}-error` : undefined}
            className="w-full rounded-xl border px-3 py-2 bg-card text-card-foreground focus:border-primary"
          />
          {titleError && (
            <p id={`${titleId}-error`} className="text-xs text-destructive">
              {t('item_create.title_required')}
            </p>
          )}
        </div>

        <div className="space-y-1">
          <label
            htmlFor={descriptionId}
            className="text-xs font-medium text-muted-foreground"
          >
            {t('item_create.description')}
          </label>
          <textarea
            id={descriptionId}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full rounded-xl border px-3 py-2 bg-card text-card-foreground focus:border-primary resize-none"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div className="space-y-1">
          <label
            htmlFor={placeId}
            className="text-xs font-medium text-muted-foreground"
          >
            {t('item_create.place')}
          </label>
          <PlaceAutocomplete id={placeId} value={place} onChange={setPlace} />
        </div>
        <div className="space-y-1">
          <label
            htmlFor={tagsId}
            className="text-xs font-medium text-muted-foreground"
          >
            {t('item_create.tags')}
          </label>
          <TagsInput id={tagsId} tags={tags} setTags={setTags} />
        </div>
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

        <Submit
          submitting={submitting}
          disabled={submitting}
          label={submitLabel}
          iconMode={showIconSubmit}
        />
      </div>
    </form>
  );
}
