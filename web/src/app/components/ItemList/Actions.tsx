'use client';

import { useI18n } from '../../i18n/useI18n';
import Icon, { IconType } from '../Icon';
import { Spinner } from '../ui/Spinner';

const ROW_ITEM =
  'inline-flex items-center gap-1.5 min-h-9 px-2 rounded-sm font-label text-[0.6875rem] transition-colors';

// Adding a photo belongs with the photographs, not in the entry's caption
// row: three labelled controls could not fit one line in a desktop grid
// column and wrapped to a second row. It doubles as the empty state, so an
// item with no pictures still has an obvious way to get its first one.
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
      className={`flex items-center justify-center gap-1.5 min-h-11 border-b border-border bg-muted/40 font-label text-[0.6875rem] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer ${
        busy ? 'pointer-events-none opacity-60' : ''
      }`}
      title={t('item_list.add_image')}
    >
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
