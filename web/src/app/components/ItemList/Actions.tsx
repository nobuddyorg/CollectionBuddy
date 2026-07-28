'use client';

import { useI18n } from '../../i18n/useI18n';
import Icon, { IconType } from '../Icon';
import { IconButton } from '../ui/IconButton';

export function Actions({
  isOpen,
  onClose,
  onUpload,
  busy,
  onEdit,
  onDelete,
}: {
  isOpen: boolean;
  onClose: () => void;
  onUpload: (file: File) => void;
  busy: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { t } = useI18n();
  return (
    <div
      className={[
        'absolute top-3.5 right-3 z-10 flex items-center gap-2 transition-opacity',
        isOpen
          ? 'opacity-100 pointer-events-auto'
          : 'opacity-0 pointer-events-none',
        '[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:pointer-events-none [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-hover:pointer-events-auto',
      ].join(' ')}
    >
      <button
        className="[@media(hover:hover)]:hidden w-9 h-9 flex items-center justify-center rounded-sm bg-muted border text-foreground shadow"
        onClick={onClose}
        aria-label={t('common.close')}
      >
        <Icon
          icon={IconType.Close}
          className="w-5 h-5"
          stroke="currentColor"
          strokeWidth="2"
          fill="none"
          aria-hidden="true"
        />
      </button>

      <label
        className="w-9 h-9 flex items-center justify-center rounded-sm bg-primary text-primary-foreground shadow-sm hover:opacity-90 transition cursor-pointer"
        aria-label={t('item_list.add_image')}
        title={t('item_list.add_image')}
      >
        <input
          type="file"
          accept="image/*"
          className="hidden"
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) {
              // Keep the row open (with its busy spinner) for the
              // duration of the upload -- ItemCard closes it once the
              // busy flag clears, instead of hiding all feedback the
              // instant a file is picked.
              onUpload(f);
            } else {
              onClose();
            }
          }}
        />
        {busy ? (
          <div className="w-4 h-4 border-2 border-primary-foreground/40 border-t-primary-foreground rounded-full animate-spin" />
        ) : (
          <Icon
            icon={IconType.Add}
            className="w-5 h-5"
            aria-hidden="true"
            stroke="currentColor"
            strokeWidth="2"
            fill="none"
          />
        )}
      </label>

      <IconButton
        onClick={() => {
          onEdit();
          onClose();
        }}
        aria-label={t('item_list.edit')}
        title={t('item_list.edit')}
      >
        <Icon
          icon={IconType.Edit}
          className="w-5 h-5"
          aria-hidden="true"
          stroke="currentColor"
          strokeWidth="2"
          fill="none"
        />
      </IconButton>

      <IconButton
        variant="destructive"
        onClick={() => {
          onDelete();
          onClose();
        }}
        aria-label={t('item_list.delete')}
        title={t('item_list.delete')}
      >
        <Icon
          icon={IconType.Trash}
          className="w-5 h-5"
          aria-hidden="true"
          stroke="currentColor"
          strokeWidth="2"
          fill="none"
        />
      </IconButton>
    </div>
  );
}
