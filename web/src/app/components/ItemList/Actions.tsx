'use client';

import { useI18n } from '../../i18n/useI18n';
import Icon, { IconType } from '../Icon';
import { IconButton, iconButtonClasses } from '../ui/IconButton';

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
      // Named for the end-to-end suite: the input is hidden behind a label,
      // and its own name is translated.
      data-testid="upload-photo"
      className="peer sr-only"
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
      className={`group/plate relative flex aspect-4/3 w-full cursor-pointer items-center justify-center bg-mount transition-colors hover:bg-mount-hover peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-foreground ${
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

// The three things you can do to an entry, as drawn boxes at the foot of
// the card. Adding a photo used to be a full-width band between the
// photograph and the caption -- a slab across the card at exactly the point
// the eye wants an uninterrupted run from object to label.
//
// It joined edit and delete as spelled-out words first, and that failed for
// a reason worth recording: a row of bare mono capitals on a white card
// gives no hint that any of it is clickable. Framed icons do, and three of
// them fit any width in any language, which spelled-out words did not --
// German ("Bearbeiten", "Eintrag löschen") overflowed the card by up to
// 45px and got clipped.
//
// Icons alone are only safe here because each has a title and an
// aria-label, and because the entry's trash no longer collides with the
// per-photo control: that one is an ✕ sitting on the photograph itself.
// Delete also keeps the far end of the row, away from the other two.
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

  return (
    <div className="mt-auto flex items-center gap-2 border-t border-border pt-3">
      {/* A file input needs a label, not a button, so it borrows the icon
          button's own classes rather than approximating them. */}
      <label
        className={`${iconButtonClasses({ variant: 'outline' })} peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-foreground cursor-pointer ${
          busy ? 'pointer-events-none opacity-60' : ''
        }`}
        title={t('item_list.add_image')}
      >
        <UploadInput
          onUpload={onUpload}
          busy={busy}
          label={t('item_list.add_image')}
        />
        {busy ? (
          <span
            className="w-4 h-4 rounded-full border-2 border-current/30 border-t-current animate-spin"
            role="status"
            aria-label={t('common.loading')}
          />
        ) : (
          <Icon
            icon={IconType.Plus}
            className="w-4 h-4"
            aria-hidden="true"
            stroke="currentColor"
            strokeWidth="2"
            fill="none"
          />
        )}
      </label>

      <IconButton
        variant="outline"
        data-testid="edit-entry"
        onClick={onEdit}
        aria-label={t('item_list.edit')}
        title={t('item_list.edit')}
      >
        <Icon
          icon={IconType.Edit}
          className="w-4 h-4"
          aria-hidden="true"
          stroke="currentColor"
          strokeWidth="2"
          fill="none"
        />
      </IconButton>

      <IconButton
        variant="outlineDestructive"
        data-testid="delete-entry"
        onClick={onDelete}
        aria-label={t('item_list.delete_entry')}
        title={t('item_list.delete_entry')}
        className="ml-auto"
      >
        <Icon
          icon={IconType.Trash}
          className="w-4 h-4"
          aria-hidden="true"
          stroke="currentColor"
          strokeWidth="2"
          fill="none"
        />
      </IconButton>
    </div>
  );
}
