'use client';

import { useI18n } from '../../i18n/useI18n';
import Icon, { IconType } from '../Icon';
import { Spinner } from '../ui/Spinner';

const ROW_ITEM =
  'inline-flex items-center gap-1.5 min-h-9 px-2 rounded-sm font-label text-[0.6875rem] transition-colors';

// The file picker itself, wrapped so both the band and the empty plate can
// hand a chosen file straight to onUpload.
function UploadInput({
  onUpload,
  busy,
}: {
  onUpload: (file: File) => void;
  busy: boolean;
}) {
  return (
    <input
      type="file"
      accept="image/*"
      className="hidden"
      disabled={busy}
      onChange={(e) => {
        const f = e.target.files?.[0];
        if (f) onUpload(f);
      }}
    />
  );
}

// Adding a photo belongs with the photographs, not in the entry's caption
// row: three labelled controls could not fit one line in a desktop grid
// column and wrapped to a second row.
//
// The band is `bg-muted`, not the `bg-muted/40` it used to be: over the
// white card that tint resolved to ~#f8f7f4, which is *lighter* than the
// #f4f3ef page it sits on. A full-width stripe of something paler than the
// background cut each card in half and read as a gap between two cards
// rather than as part of one.
export function AddPhoto({
  onUpload,
  busy,
}: {
  onUpload: (file: File) => void;
  busy: boolean;
}) {
  const { t } = useI18n();
  return (
    <label
      className={`flex items-center justify-center gap-1.5 min-h-11 border-b border-border bg-muted font-label text-[0.6875rem] text-muted-foreground hover:bg-border hover:text-foreground transition-colors cursor-pointer ${
        busy ? 'pointer-events-none opacity-60' : ''
      }`}
      title={t('item_list.add_image')}
    >
      <UploadInput onUpload={onUpload} busy={busy} />
      {busy ? (
        <Spinner size="sm" />
      ) : (
        <Icon
          icon={IconType.Plus}
          className="w-3.5 h-3.5"
          aria-hidden="true"
          stroke="currentColor"
          strokeWidth="2"
          fill="none"
        />
      )}
      {t('item_list.add_image')}
    </label>
  );
}

// An empty mount. Entries without a photograph used to open straight onto
// the caption, so they had a silhouette nothing like their neighbours' and
// a scrolling stack of them had no repeating shape to break on. This holds
// the same 4:3 frame a single photograph gets, and is itself the way to
// fill it -- so the empty card needs no separate add-photo band.
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
      className={`group/plate relative flex aspect-4/3 w-full cursor-pointer items-center justify-center bg-muted transition-colors hover:bg-border ${
        busy ? 'pointer-events-none opacity-60' : ''
      }`}
      title={t('item_list.add_image')}
    >
      <UploadInput onUpload={onUpload} busy={busy} />

      {/* A hairline mount rule inset from the edge -- the empty frame in a
          specimen case, rather than a flat grey rectangle. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-3 rounded-sm border border-dashed border-border"
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
export function Actions({
  onEdit,
  onDelete,
}: {
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { t } = useI18n();

  return (
    <div className="-mx-2 mt-auto flex items-center gap-x-2 border-t border-border pt-2.5">
      <button
        type="button"
        onClick={onEdit}
        className={`${ROW_ITEM} text-muted-foreground hover:text-foreground hover:bg-muted`}
      >
        <Icon
          icon={IconType.Edit}
          className="w-3.5 h-3.5"
          aria-hidden="true"
          stroke="currentColor"
          strokeWidth="2"
          fill="none"
        />
        {t('item_list.edit')}
      </button>

      {/* Names the entry explicitly so it can never be mistaken for the
          delete control sitting on an individual photo. */}
      <button
        type="button"
        onClick={onDelete}
        className={`${ROW_ITEM} ml-auto text-muted-foreground hover:text-destructive hover:bg-destructive/10`}
      >
        <Icon
          icon={IconType.Trash}
          className="w-3.5 h-3.5"
          aria-hidden="true"
          stroke="currentColor"
          strokeWidth="2"
          fill="none"
        />
        {t('item_list.delete_entry')}
      </button>
    </div>
  );
}
