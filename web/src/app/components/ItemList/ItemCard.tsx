'use client';
import { useState } from 'react';
import type { CSSProperties } from 'react';
import Icon, { IconType } from '../Icon';
import { useI18n } from '../../i18n/useI18n';
import { inkVarFor, rotationDegFor } from '../../lib/specimen';
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

  // The action row is kept open through an upload so its busy spinner stays
  // visible; close it automatically once the upload settles. Detected as a
  // render-time transition rather than a useEffect so it takes effect the
  // same render busy flips, not one render later.
  const [wasBusy, setWasBusy] = useState(busy);
  if (busy !== wasBusy) {
    setWasBusy(busy);
    if (wasBusy && !busy) close();
  }

  const ink = inkVarFor(item.id);
  const rotation = rotationDegFor(item.id);

  return (
    <li
      className="fade-up group relative rounded-lg border-2 border-card-foreground/10 bg-card text-card-foreground p-4 pt-5 shadow-md space-y-3 transition-transform hover:z-10 hover:-translate-y-0.5"
      style={
        {
          '--ink': ink,
          transform: `rotate(${rotation}deg)`,
        } as CSSProperties
      }
    >
      <span className="pin left-4 -top-2.5" aria-hidden="true" />

      <div className="font-display text-base pr-16 truncate">{item.title}</div>

      <button
        className={`absolute top-4 right-3 [@media(hover:hover)]:hidden w-9 h-9 flex items-center justify-center rounded-xl bg-muted text-foreground shadow ${open ? 'hidden' : ''}`}
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
        <div className="text-sm text-card-foreground/70 line-clamp-3">
          {item.description}
        </div>
      )}

      {item.place && (
        <div className="flex items-center gap-2 font-label text-[0.7rem] text-card-foreground/70">
          <Icon
            icon={IconType.Pin}
            className="w-4 h-4 shrink-0 opacity-80"
            aria-hidden="true"
          />
          <span className="truncate normal-case">{item.place}</span>
        </div>
      )}

      {!!item.tags.length && (
        <div className="flex flex-wrap gap-1.5">
          {item.tags.map((tag) => (
            <span
              key={tag}
              className="font-label text-[0.65rem] inline-flex items-center gap-1 border border-[var(--ink)] text-[var(--ink)] rounded-full px-2 py-0.5"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      <div className={imgs.length ? 'corner-mount' : undefined}>
        <ImageGrid
          imgs={imgs}
          itemTitle={item.title}
          isOpen={open}
          onOpenModal={onOpenModal}
          onDelete={onDeleteImage}
          deletingPath={deletingPath}
          busy={busy}
        />
      </div>
    </li>
  );
}
