'use client';

import { useI18n } from '../../i18n/useI18n';
import Icon, { IconType } from '../Icon';

// Tightened from px-2/gap-1.5: the row now carries three labelled controls
// instead of two, and German runs long ("Bearbeiten", "Eintrag löschen").
// px-1 rather than px-1.5 is what clears the tightest case -- German in a
// two-column grid at exactly 640px, which was 3px over and would have sat
// right on the wrap boundary, flickering between one line and two.
const ROW_ITEM =
  'inline-flex shrink-0 items-center gap-1 min-h-9 px-1 rounded-sm font-label text-[0.6875rem] whitespace-nowrap transition-colors';

// The file picker itself, wrapped so both the row control and the empty
// plate can hand a chosen file straight to onUpload.
function UploadInput({
  onUpload,
  busy,
  label,
}: {
  onUpload: (file: File) => void;
  busy: boolean;
  /** Names the input regardless of how short the visible text is. */
  label?: string;
}) {
  return (
    <input
      type="file"
      accept="image/*"
      className="hidden"
      aria-label={label}
      disabled={busy}
      onChange={(e) => {
        const f = e.target.files?.[0];
        if (f) onUpload(f);
      }}
    />
  );
}

// An empty mount. Entries without a photograph used to open straight onto
// the caption, so they had a silhouette nothing like their neighbours' and
// a scrolling stack of them had no repeating shape to break on. This holds
// the same 4:3 frame a single photograph gets, and is itself the way to
// fill it.
//
// `--mount` sits a step below `--muted`, so the plate reads as a hollow cut
// into the white card rather than another pale panel floating on it.
export function AddPhotoPlate({
  onUpload,
  busy,
}: {
  onUpload: (file: File) => void;
  busy: boolean;
}) {
  const { t } = useI18n();
  return (
    <label
      className={`group/plate relative flex aspect-4/3 w-full cursor-pointer items-center justify-center bg-mount transition-colors hover:bg-mount-hover ${
        busy ? 'pointer-events-none opacity-60' : ''
      }`}
      title={t('item_list.add_image')}
    >
      <UploadInput onUpload={onUpload} busy={busy} />

      {/* A hairline mount rule inset from the edge -- the empty frame in a
          specimen case, rather than a flat grey rectangle. Drawn in tinted
          ink, not `--border`: the deeper plate is now that exact colour, so
          a `border-border` rule vanished into its own background. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-3 rounded-sm border border-dashed border-foreground/20"
      />

      {/* States the condition, then offers the way out of it -- the band
          only ever named the action, which said nothing about why the
          frame was empty. */}
      <span className="relative flex flex-col items-center gap-2.5 text-muted-foreground transition-colors group-hover/plate:text-foreground">
        {/* The shared <Spinner> draws in white, for the dark controls it
            normally sits on; on this pale plate it would be invisible.
            The `.spinner` utility inherits currentColor instead. */}
        {busy ? (
          <span
            className="spinner"
            role="status"
            aria-label={t('common.loading')}
          />
        ) : (
          <Icon icon={IconType.Photo} className="w-8 h-8" aria-hidden="true" />
        )}

        <span className="font-label text-[0.6875rem]">
          {t('item_list.no_images')}
        </span>

        <span className="inline-flex items-center gap-1.5 rounded-sm bg-card px-2.5 py-1.5 font-label text-[0.6875rem] text-foreground ring-1 ring-border">
          <Icon
            icon={IconType.Plus}
            className="w-3.5 h-3.5"
            aria-hidden="true"
            stroke="currentColor"
            strokeWidth="2"
            fill="none"
          />
          {t('item_list.add_image')}
        </span>
      </span>
    </label>
  );
}

// Entry-level actions, in the label area and spelled out. They used to
// float as bare icons in the card's top-right corner, on top of the hero
// image's own delete button -- two identical red trash icons overlapping,
// with nothing to say which removed the photo and which removed the entry.
//
// Adding a photo now lives here too. It had been a full-width band between
// the photograph and the caption, and a slab across the card at exactly the
// point the eye wants an uninterrupted run from object to label is the one
// place it could not go. All three things you can do to an entry are in one
// row instead, at the foot of the card.
//
// Two things buy the space for a third control, because three of them
// genuinely did not fit one line before:
//
//   - The upload label is short ("Photo" / "Bild"); its input carries the
//     full "Add image" as its accessible name.
//   - The row is words only, no icons. Measured across en/de at 390-1280px,
//     the icons cost 54px of a row that was overflowing by up to 45px in
//     German ("Bearbeiten", "Eintrag löschen"). Words alone fit every
//     width in both languages with room to spare -- and a line of spaced
//     mono capitals is the museum object label this whole card is built
//     around, so the icons were the less considered half anyway.
export function Actions({
  onEdit,
  onDelete,
  onUpload,
  busy,
}: {
  onEdit: () => void;
  onDelete: () => void;
  onUpload: (file: File) => void;
  busy: boolean;
}) {
  const { t } = useI18n();

  // flex-wrap is a safety net, not a layout: nothing wraps at any width in
  // either language today, but a longer translation should drop to a second
  // line rather than run off a card that clips its overflow.
  return (
    <div className="-mx-1 mt-auto flex flex-wrap items-center gap-x-1 gap-y-1 border-t border-border pt-2.5">
      <label
        className={`${ROW_ITEM} cursor-pointer text-muted-foreground hover:text-foreground hover:bg-muted ${
          busy ? 'pointer-events-none opacity-60' : ''
        }`}
        title={t('item_list.add_image')}
      >
        <UploadInput
          onUpload={onUpload}
          busy={busy}
          label={t('item_list.add_image')}
        />
        {/* The one mark left in the row: without it "Photo" reads as a
            label for something rather than as the thing that adds one. */}
        {busy ? (
          <span
            className="w-2.5 h-2.5 rounded-full border-2 border-current/30 border-t-current animate-spin"
            role="status"
            aria-label={t('common.loading')}
          />
        ) : (
          <span aria-hidden="true">+</span>
        )}
        {t('item_list.add_image_short')}
      </label>

      <button
        type="button"
        onClick={onEdit}
        className={`${ROW_ITEM} text-muted-foreground hover:text-foreground hover:bg-muted`}
      >
        {t('item_list.edit')}
      </button>

      {/* Names the entry explicitly so it can never be mistaken for the
          delete control sitting on an individual photo, and stays pushed
          to the far end of the row, away from edit. */}
      <button
        type="button"
        onClick={onDelete}
        className={`${ROW_ITEM} ml-auto text-muted-foreground hover:text-destructive hover:bg-destructive/10`}
      >
        {t('item_list.delete_entry')}
      </button>
    </div>
  );
}
