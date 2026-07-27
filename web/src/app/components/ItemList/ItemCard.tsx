'use client';
import { useEffect, useRef, useState } from 'react';
import Icon, { IconType } from '../Icon';
import { useI18n } from '../../i18n/useI18n';
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
}: {
  item: ItemLite;
  imgs: ImgEntry[];
  busy: boolean;
  deletingPath: Set<string>;
  onUpload: (file: File) => void;
  onEditItem: () => void;
  onDeleteItem: () => void;
  onDeleteImage: (img: ImgEntry) => void;
  onOpenModal: (url: string) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  // The action row is kept open through an upload so its busy spinner
  // stays visible; close it automatically once the upload settles.
  const wasBusy = useRef(busy);
  useEffect(() => {
    if (wasBusy.current && !busy) close();
    wasBusy.current = busy;
  }, [busy]);

  return (
    <li className="fade-up group relative rounded-2xl border bg-card/70 dark:bg-card/60 backdrop-blur p-3 shadow-sm space-y-3">
      <div className="font-medium pr-16 truncate">{item.title}</div>

      <button
        className={`absolute top-3 right-3 [@media(hover:hover)]:hidden w-9 h-9 flex items-center justify-center rounded-xl bg-muted text-foreground shadow ${open ? 'hidden' : ''}`}
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
              className="inline-flex items-center gap-1 bg-primary/15 text-amber-800 dark:text-amber-200 rounded-full px-2 py-0.5 text-xs"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      <ImageGrid
        imgs={imgs}
        itemTitle={item.title}
        isOpen={open}
        onOpenModal={onOpenModal}
        onDelete={onDeleteImage}
        deletingPath={deletingPath}
        busy={busy}
      />
    </li>
  );
}
