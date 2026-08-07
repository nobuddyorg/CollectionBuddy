'use client';

import { useCallback, useId, useRef, useState } from 'react';
import { useI18n } from '../../i18n/useI18n';
import { PlaceAutocomplete } from './PlaceAutocomplete';
import { Submit } from './Submit';
import { TagsInput } from './TagsInput';
import type { ItemFormProps, ItemFormValues, PlaceCoords } from './types';

export type { ItemFormValues } from './types';
export { EMPTY_ITEM_FORM_VALUES } from './types';

// `block` is what makes the four fields line up, and it has to be on all of
// them or none. A label is inline by default, so it sits in a line box sized
// by the inherited 1.5 line-height rather than its own -- which pushes the
// text down by 6px and the field under it by 4. Everything used to be inline
// and therefore wrong in the same way; the description is now a flex item,
// which blockifies it, so it would be the only one that isn't.
const LABEL = 'block text-xs font-medium text-muted-foreground';

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
      {/* Title, place and tags stack down the left; the description takes
          the whole right column beside them. It is the only free-form field
          here -- the other three are one-liners -- so it is the only one
          that has any use for the height, and giving it all three rows'
          worth is what stops it being a two-line box with empty space
          alongside the fields underneath it.

          The desktop placement is done by the grid rather than by the DOM,
          so source order stays title -> description -> place -> tags and
          the single-column phone layout still reads in that order. */}
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
            className="w-full rounded-sm px-3 py-2 min-h-11 bg-card text-card-foreground ring-1 ring-inset ring-border focus:ring-foreground"
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
          {/* Two rows is right on a phone, where the modal is the whole
              screen and every extra row pushes the save button further out
              of reach. On a desktop it fills the column instead (#251), and
              can still be dragged taller from there: `flex-auto` -- rather
              than `flex-1` -- keeps the dragged height as the flex base
              size, so the grid row grows with it instead of the browser
              writing a height the layout then ignores. Dragging it shorter
              than the fields beside it does nothing, which is the price of
              having it match their height by default. */}
          <textarea
            id={descriptionId}
            data-testid="item-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full rounded-sm px-3 py-2 min-h-11 sm:min-h-32 sm:flex-auto bg-card text-card-foreground ring-1 ring-inset ring-border focus:ring-foreground resize-none sm:resize-y"
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
