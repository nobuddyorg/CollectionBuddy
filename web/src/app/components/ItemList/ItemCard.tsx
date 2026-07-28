'use client';
import { useI18n } from '../../i18n/useI18n';
import type { ItemLite, ImgEntry } from './types';
import { Actions } from './Actions';
import { ImageGrid } from './ImageGrid';

// A specimen mount: the object leads, the label sits underneath. Photos are
// what a collector actually recognises an item by, so they get the top of
// the card and the full width of it.
//
// Entry actions live in the label area rather than floating over the photo:
// a photo carries its own delete control, and two identical trash icons in
// the same corner gave no way to tell which one removed which thing.
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

  return (
    <li className="fade-up group relative flex flex-col bg-card text-card-foreground ring-1 ring-border sm:rounded-sm shadow-[0_1px_2px_rgb(23_32_58/0.06)] transition-shadow hover:shadow-[0_6px_20px_rgb(23_32_58/0.10)]">
      <ImageGrid
        imgs={imgs}
        itemTitle={item.title}
        onOpenModal={onOpenModal}
        onDelete={onDeleteImage}
        deletingPath={deletingPath}
        busy={busy}
      />

      {/* The object label. */}
      <div className="flex flex-col gap-2 p-4">
        <h3 className="font-display text-[0.95rem] leading-snug">
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

        <Actions
          onUpload={onUpload}
          busy={busy}
          onEdit={onEditItem}
          onDelete={onDeleteItem}
        />

        <span className="sr-only" aria-live="polite">
          {busy ? t('item_list.loading') : ''}
        </span>
      </div>
    </li>
  );
}
