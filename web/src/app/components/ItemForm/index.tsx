'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useI18n } from '../../i18n/useI18n';
import { PlaceAutocomplete } from './PlaceAutocomplete';
import { Submit } from './Submit';
import { TagsInput } from './TagsInput';
import type { ItemFormProps, PlaceCoords } from './types';
import { fieldClasses } from '../ui/fieldClasses';
import { buttonClasses } from '../ui/buttonClasses';

export type { ItemFormValues } from './types';
export { EMPTY_ITEM_FORM_VALUES } from './types';

// `block` must be on all four labels or none: an inline label sits in a line
// box sized by the inherited line-height, which pushes it (and the field
// under it) out of alignment with the others.
const LABEL = 'block text-xs font-medium text-muted-foreground';

export default function ItemForm({
  initial,
  submitting = false,
  submitLabel,
  onSubmit,
  onCancel,
  onDirtyChange,
}: ItemFormProps) {
  const { t } = useI18n();

  // Callers reset the form by changing `key`, which remounts it and reruns
  // these initializers; resyncing on `initial` identity here too would clear
  // whatever the user typed on any unrelated parent re-render.
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

  // Compared against `initial` directly rather than a separate snapshot:
  // `initial` doesn't change for the life of one mount, so it already is the
  // "nothing typed yet" baseline.
  const isDirty =
    title !== (initial.title ?? '') ||
    description !== (initial.description ?? '') ||
    place !== (initial.place ?? '') ||
    (placeCoords?.lat ?? null) !== (initial.place_lat ?? null) ||
    (placeCoords?.lng ?? null) !== (initial.place_lng ?? null) ||
    tags.length !== (initial.tags?.length ?? 0) ||
    tags.some((tag, i) => tag !== initial.tags?.[i]);

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

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
      });
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
      {/* Desktop placement is done by the grid, not by DOM order, so source
          order stays title -> description -> place -> tags and the
          single-column phone layout still reads in that order. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-2 gap-y-3">
        <div className="space-y-1">
          <label htmlFor={titleId} className={LABEL}>
            {t('item_create.title')}
            <span aria-hidden="true"> *</span>
          </label>
          <input
            id={titleId}
            // Named for the end-to-end suite: every label in this form is
            // translated, so naming a field by its label pins the language.
            data-testid="item-title"
            ref={titleRef}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => setTitleTouched(true)}
            required
            aria-required="true"
            aria-invalid={titleError}
            aria-describedby={titleError ? `${titleId}-error` : undefined}
            className={fieldClasses()}
          />
          {titleError && (
            <p id={`${titleId}-error`} className="text-xs text-destructive">
              {t('item_create.title_required')}
            </p>
          )}
        </div>

        <div className="space-y-1 sm:col-start-2 sm:row-start-1 sm:row-span-3 sm:flex sm:flex-col">
          <label htmlFor={descriptionId} className={LABEL}>
            {t('item_create.description')}
          </label>
          {/* `flex-auto` rather than `flex-1` keeps a manually dragged
              height as the flex base size, so the grid row grows with it
              instead of the browser writing a height the layout ignores. */}
          <textarea
            id={descriptionId}
            data-testid="item-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className={fieldClasses(
              'sm:min-h-32 sm:flex-auto resize-none sm:resize-y',
            )}
          />
        </div>

        <div className="space-y-1">
          <label htmlFor={placeId} className={LABEL}>
            {t('item_create.place')}
          </label>
          <PlaceAutocomplete
            id={placeId}
            value={place}
            onChange={handlePlaceChange}
          />
        </div>

        <div className="space-y-1">
          <label htmlFor={tagsId} className={LABEL}>
            {t('item_create.tags')}
          </label>
          <TagsInput id={tagsId} tags={tags} setTags={setTags} />
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-1">
        {onCancel && (
          <button type="button" onClick={onCancel} className={buttonClasses()}>
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
