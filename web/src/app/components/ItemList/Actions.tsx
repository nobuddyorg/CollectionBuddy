'use client';

import { useI18n } from '../../i18n/useI18n';
import Icon, { IconType } from '../Icon';
import { IconButton, iconButtonClasses } from '../ui/IconButton';
import { Spinner } from '../ui/Spinner';

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
  readOnly = false,
}: {
  onUpload: (file: File) => void;
  busy: boolean;
  /** A shared category's own empty mount (#483 follow-up): the same frame,
   * with no invitation to fill it -- there is nothing here for a grantee
   * to upload into. Rendered as a `div`, not the interactive `label` below,
   * so nothing about it reads as clickable. */
  readOnly?: boolean;
}) {
  const { t } = useI18n();
  const Frame = readOnly ? 'div' : 'label';
  return (
    <Frame
      className={`group/plate relative flex aspect-4/3 w-full items-center justify-center bg-mount transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-foreground ${
        readOnly
          ? ''
          : `cursor-pointer hover:bg-mount-hover ${busy ? 'pointer-events-none opacity-60' : ''}`
      }`}
      title={readOnly ? undefined : t('item_list.add_image')}
    >
      {!readOnly && <UploadInput onUpload={onUpload} busy={busy} />}

      {/* A hairline mount rule inset from the edge -- the empty frame in a
          specimen case, rather than a flat grey rectangle. Still the page's
          own ink laid on thin rather than `--border` (which is now the
          exact colour of the plate it would sit on), but at 60% rather than
          20%: the fainter tint measured 1.76:1 in dark / 1.47:1 in light
          against `--mount`, well under the 3:1 WCAG floor for a non-text
          boundary, so the "hollow cut" had no visible edge in either theme
          (#516). 60% clears it with room in both (3.92:1 / 6.43:1) without
          reading as a harsh outline the way full-strength `--foreground`
          would have. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-3 rounded-sm border border-dashed border-foreground/60"
      />

      {/* States the condition, then offers the way out of it -- the band
          only ever named the action, which said nothing about why the
          frame was empty. Read-only drops that "way out": there is one
          fewer line here (no CTA chip), not a disabled copy of it. */}
      {/* `text-muted-foreground` on `bg-mount` reads at 3.85:1 in the light
          theme, below the 4.5:1 AA floor for this 11px label -- and the
          resting state is the one read, since touch has no hover.
          `text-foreground/80` carries 7.10:1 on light `--mount` and 10.65:1
          on dark, so both themes clear AA without a new token. */}
      <span className="relative flex flex-col items-center gap-2.5 text-foreground/80 transition-colors group-hover/plate:text-foreground">
        {busy && !readOnly ? (
          <span role="status" aria-label={t('common.loading')}>
            <Spinner size="xl" />
          </span>
        ) : (
          <Icon icon={IconType.Photo} className="w-8 h-8" aria-hidden="true" />
        )}

        <span className="font-label text-[0.6875rem]">
          {t('item_list.no_images')}
        </span>

        {!readOnly && (
          <span className="inline-flex items-center gap-1.5 rounded-sm bg-card px-2.5 py-1.5 font-label text-[0.6875rem] text-foreground ring-1 ring-border">
            <Icon
              icon={IconType.Plus}
              className="w-3.5 h-3.5"
              aria-hidden="true"
            />
            {t('item_list.add_image')}
          </span>
        )}
      </span>
    </Frame>
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
          <span role="status" aria-label={t('common.loading')}>
            <Spinner size="sm" />
          </span>
        ) : (
          <Icon icon={IconType.Plus} className="w-4 h-4" aria-hidden="true" />
        )}
      </label>

      <IconButton
        variant="outline"
        data-testid="edit-entry"
        onClick={onEdit}
        aria-label={t('item_list.edit')}
        title={t('item_list.edit')}
      >
        <Icon icon={IconType.Edit} className="w-4 h-4" aria-hidden="true" />
      </IconButton>

      <IconButton
        variant="outlineDestructive"
        data-testid="delete-entry"
        onClick={onDelete}
        aria-label={t('item_list.delete_entry')}
        title={t('item_list.delete_entry')}
        className="ml-auto"
      >
        <Icon icon={IconType.Trash} className="w-4 h-4" aria-hidden="true" />
      </IconButton>
    </div>
  );
}
