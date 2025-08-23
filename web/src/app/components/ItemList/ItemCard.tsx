'use client';
import { useState } from 'react';
import Icon, { IconType } from '../Icon';
import type { ItemLite, ImgEntry } from './types';
import { Actions } from './Actions';
import { ImageGrid } from './ImageGrid';

export function ItemCard({
  item,
  imgs,
  busy,
  deletingPath,
  onUpload,
  onEditItem,
  onDeleteItem,
  onDeleteImage,
  onOpenModal,
  i18n: { t },
}: {
  item: ItemLite;
  imgs: ImgEntry[];
  busy: boolean;
  deletingPath: string | null;
  onUpload: (file: File) => void;
  onEditItem: () => void;
  onDeleteItem: () => void;
  onDeleteImage: (img: ImgEntry) => void;
  onOpenModal: (url: string) => void;
  i18n: { t: (k: string) => string };
}) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <li className="group relative rounded-2xl border bg-card/70 dark:bg-card/60 bg-neutral-100/50 dark:bg-neutral-800/50 backdrop-blur p-3 shadow-sm space-y-3">
      <div className="font-medium pr-16 truncate">{item.title}</div>

      <button
        className={`absolute top-3 right-3 sm:hidden w-9 h-9 flex items-center justify-center rounded-xl bg-muted text-foreground shadow ${open ? 'hidden' : ''}`}
        onClick={() => setOpen(true)}
        aria-label={t('item_list.more_actions')}
      >
        <Icon
          icon={IconType.More}
          className="w-5 h-5"
          fill="currentColor"
          aria-hidden="true"
        />
      </button>

      <Actions
        isOpen={open}
        onClose={close}
        onUpload={onUpload}
        busy={busy}
        onEdit={onEditItem}
        onDelete={onDeleteItem}
      />

      {item.description && (
        <div className="text-sm text-muted-foreground line-clamp-3">
          {item.description}
        </div>
      )}

      {item.place && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Icon
            icon={IconType.Pin}
            className="w-4 h-4 shrink-0 opacity-80"
            aria-hidden="true"
          />
          <span className="truncate">{item.place}</span>
        </div>
      )}

      {!!item.tags.length && (
        <div className="flex flex-wrap gap-1.5">
          {item.tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 bg-primary/10 dark:bg-primary/20 text-primary rounded-full px-2 py-0.5 text-xs"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      <ImageGrid
        imgs={imgs}
        isOpen={open}
        onOpenModal={onOpenModal}
        onDelete={onDeleteImage}
        deletingPath={deletingPath}
        busy={busy}
      />
    </li>
  );
}
