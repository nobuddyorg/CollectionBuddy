'use client';

import { useI18n } from '../../i18n/useI18n';
import Icon, { IconType } from '../Icon';

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
        'absolute top-3 right-3 flex items-center gap-2 transition-opacity',
        isOpen
          ? 'opacity-100 pointer-events-auto'
          : 'opacity-0 pointer-events-none',
        'sm:opacity-0 sm:pointer-events-none sm:group-hover:opacity-100 sm:group-hover:pointer-events-auto',
      ].join(' ')}
    >
      <button
        className="sm:hidden w-9 h-9 flex items-center justify-center rounded-xl bg-card border text-foreground shadow"
        onClick={onClose}
        aria-label={t('common.close') ?? 'Close'}
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
        className="w-9 h-9 flex items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm hover:brightness-110 transition cursor-pointer"
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
            onClose();
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

      <button
        onClick={() => {
          onEdit();
          onClose();
        }}
        className="w-9 h-9 rounded-xl bg-primary text-primary-foreground shadow-sm hover:brightness-110 flex items-center justify-center"
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
      </button>

      <button
        onClick={() => {
          onDelete();
          onClose();
        }}
        className="w-9 h-9 rounded-xl bg-red-500 text-white shadow-sm hover:bg-red-600 flex items-center justify-center"
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
      </button>
    </div>
  );
}
