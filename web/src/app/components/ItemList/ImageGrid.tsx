'use client';
import Image from 'next/image';
import Icon, { IconType } from '../Icon';
import type { ImgEntry } from './types';
import { useI18n } from '../../i18n/useI18n';

export function ImageGrid({
  imgs,
  isOpen,
  onOpenModal,
  onDelete,
  deletingPath,
  busy,
}: {
  imgs: ImgEntry[];
  isOpen: boolean;
  onOpenModal: (url: string) => void;
  onDelete: (img: ImgEntry) => void;
  deletingPath: string | null;
  busy: boolean;
}) {
  const { t } = useI18n();
  if (!imgs.length) {
    return (
      <div className="text-sm text-muted-foreground">
        {t('item_list.no_images')}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-2">
      {imgs.map((img) => (
        <div
          key={img.pathFull}
          className="relative group"
          onClick={() => onOpenModal(img.urlFull)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') onOpenModal(img.urlFull);
          }}
        >
          <Image
            src={img.urlThumb || img.urlFull}
            alt={t('item_list.image_alt').replace('{idx}', '')}
            width={160}
            height={160}
            unoptimized
            className="h-20 w-full object-cover rounded-xl cursor-pointer"
          />
          <button
            title={t('item_list.delete')}
            onClick={(e) => {
              e.stopPropagation();
              onDelete(img);
            }}
            disabled={deletingPath === img.pathFull || busy}
            className={[
              isOpen ? 'opacity-100' : 'opacity-0',
              'sm:opacity-0 sm:group-hover:opacity-100',
              'absolute top-1 right-1 w-7 h-7 flex items-center justify-center rounded-lg bg-red-600 text-white shadow disabled:opacity-60 transition',
            ].join(' ')}
          >
            {deletingPath === img.pathFull ? (
              <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            ) : (
              <Icon
                icon={IconType.Trash}
                className="w-4 h-4"
                stroke="currentColor"
                strokeWidth="2"
                fill="none"
              />
            )}
          </button>
        </div>
      ))}
    </div>
  );
}
