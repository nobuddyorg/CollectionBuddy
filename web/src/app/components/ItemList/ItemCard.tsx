'use client';
import { useState } from 'react';
import Icon, { IconType } from '../Icon';
import { useI18n } from '../../i18n/useI18n';
import type { ItemLite, ImgEntry } from './types';
import { Actions } from './Actions';
import { ImageGrid } from './ImageGrid';

// A specimen mount: the object leads, the label sits underneath. Photos are
// what a collector actually recognises an item by, so they get the top of
// the card and the full width of it -- the previous layout buried
// thumbnails below three blocks of text.
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

  return (
    <li className="fade-up group relative flex flex-col bg-card text-card-foreground ring-1 ring-border sm:rounded-sm shadow-[0_1px_2px_rgb(23_32_58/0.06)] transition-shadow hover:shadow-[0_6px_20px_rgb(23_32_58/0.10)]">
      <ImageGrid
        imgs={imgs}
        itemTitle={item.title}
        isOpen={open}
        onOpenModal={onOpenModal}
        onDelete={onDeleteImage}
        deletingPath={deletingPath}
        busy={busy}
      />

      <button
        className={`absolute top-2 right-2 [@media(hover:hover)]:hidden w-10 h-10 flex items-center justify-center rounded-sm bg-card/90 text-card-foreground ring-1 ring-border ${open ? 'hidden' : ''}`}
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

      {/* The object label. */}
      <div className="flex flex-col gap-2 p-4">
        <h3 className="font-display text-[0.95rem] leading-snug pr-8">
          {item.title}
        </h3>

        {item.description && (
          <p className="text-sm leading-relaxed text-muted-foreground line-clamp-2">
            {item.description}
          </p>
        )}

        {(item.place || !!item.tags.length) && (
          <div className="flex flex-col gap-2 border-t border-border pt-2.5 mt-0.5">
            {item.place && (
              <div className="font-label text-[0.6875rem] text-muted-foreground truncate">
                {item.place}
              </div>
            )}

            {!!item.tags.length && (
              <div className="flex flex-wrap gap-1">
                {item.tags.map((tag) => (
                  <span key={tag} className="tag-chip">
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </li>
  );
}
