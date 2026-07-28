'use client';

import { useI18n } from '../../i18n/useI18n';
import Icon, { IconType } from '../Icon';
import { Spinner } from '../ui/Spinner';

// Entry-level actions, in the label area under the photograph and spelled
// out. They used to float as bare icons in the card's top-right corner,
// where they sat on top of the hero image's own delete button -- two
// identical red trash icons overlapping, with nothing to say which one
// removed the photo and which removed the whole entry.
export function Actions({
  onUpload,
  busy,
  onEdit,
  onDelete,
}: {
  onUpload: (file: File) => void;
  busy: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { t } = useI18n();

  // The row is pulled left as a whole so the first label optically aligns
  // with the caption above it; pulling each button instead cancelled the
  // gap between them and ran the labels together.
  const base =
    'inline-flex items-center gap-1.5 min-h-9 px-2 rounded-sm font-label text-[0.6875rem] transition-colors';

  return (
    <div className="-mx-2 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-border pt-2.5 mt-0.5">
      <label
        className={`${base} text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer ${
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

      <button
        type="button"
        onClick={onEdit}
        className={`${base} text-muted-foreground hover:text-foreground hover:bg-muted`}
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
        className={`${base} ml-auto text-muted-foreground hover:text-destructive hover:bg-destructive/10`}
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
