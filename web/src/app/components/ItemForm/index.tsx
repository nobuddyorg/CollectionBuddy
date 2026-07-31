'use client';

import { useCallback, useId, useRef, useState } from 'react';
import { useI18n } from '../../i18n/useI18n';
import { PlaceAutocomplete } from './PlaceAutocomplete';
import { Submit } from './Submit';
import { TagsInput } from './TagsInput';
import type { ItemFormProps, ItemFormValues, PlaceCoords } from './types';

export type { ItemFormValues } from './types';

export default function ItemForm({
  initial,
  submitting = false,
  submitLabel,
  onSubmit,
  onCancel,
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
  // Carried through untouched unless the field is edited, so editing an
  // item's title doesn't quietly strip the coordinates off its place.
  const [placeCoords, setPlaceCoords] = useState<PlaceCoords | null>(
    initial.place_lat != null && initial.place_lng != null
      ? { lat: initial.place_lat, lng: initial.place_lng }
      : null,
  );
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
      onSubmit({
        title,
        description,
        place,
        place_lat: placeCoords?.lat ?? null,
        place_lng: placeCoords?.lng ?? null,
        tags,
      } as ItemFormValues);
    },
    [onSubmit, title, description, place, placeCoords, tags],
  );

  const handlePlaceChange = useCallback(
    (value: string, coords: PlaceCoords | null) => {
      setPlace(value);
      setPlaceCoords(coords);
    },
    [],
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
            className="w-full rounded-sm px-3 py-2 min-h-11 bg-card text-card-foreground ring-1 ring-inset ring-border focus:ring-foreground"
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
          {/* Two rows is right on a phone, where the modal is the whole
              screen and every extra row pushes the save button further out
              of reach. On a desktop the dialog has room going spare, so the
              field takes it rather than making a paragraph scroll inside
              three lines (#251), and can be dragged taller from there. */}
          <textarea
            id={descriptionId}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full rounded-sm px-3 py-2 min-h-11 sm:min-h-32 bg-card text-card-foreground ring-1 ring-inset ring-border focus:ring-foreground resize-none sm:resize-y"
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
          <PlaceAutocomplete
            id={placeId}
            value={place}
            onChange={handlePlaceChange}
          />
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

      <div className="flex justify-end gap-2 pt-1">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="min-h-11 px-4 rounded-sm font-label text-xs ring-1 ring-inset ring-border hover:bg-muted transition-colors"
          >
            {t('common.cancel')}
          </button>
        )}

        <Submit
          submitting={submitting}
          disabled={submitting}
          label={submitLabel}
        />
      </div>
    </form>
  );
}
