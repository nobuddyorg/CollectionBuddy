'use client';
import { memo, useRef, useState } from 'react';
import { useI18n } from '../../i18n/useI18n';
import type { ItemLite, ImgEntry } from './types';
import { Actions, AddPhotoPlate } from './Actions';
import { ImageGrid } from './ImageGrid';
import { CaptionSkeleton } from './Skeleton';

type ItemCardProps = {
  item: ItemLite;
  imgs: ImgEntry[];
  /** Photographs handed over for this entry that have not landed yet. */
  pendingUploads?: number;
  imagesLoading?: boolean;
  onUpload: (file: File) => void;
  onEditItem: () => void;
  onDeleteItem: () => void;
  onDeleteImage: (img: ImgEntry) => void;
  /** Opens the full-size carousel at this photograph's position in `imgs`. */
  onOpenModal: (index: number) => void;
  /** This card is one of the first few on the page -- its hero photograph
   * is likely the LCP element. */
  priority?: boolean;
  /** Category shared with, not owned by, the viewer: no edit, delete, or
   * upload control anywhere on the card. */
  readOnly?: boolean;
};

// Photos lead, the label sits beneath: what a collector actually
// recognises an item by. Actions live in the label area rather than
// floating over the photo, since the photo has its own delete control.
function ItemCardComponent({
  item,
  imgs,
  pendingUploads = 0,
  imagesLoading = false,
  onUpload,
  onEditItem,
  onDeleteItem,
  onDeleteImage,
  onOpenModal,
  priority = false,
  readOnly = false,
}: ItemCardProps) {
  const { t } = useI18n();

  const busy = pendingUploads > 0;
  const dropDisabled = readOnly || busy;

  // An upload in flight counts as something coming, so the empty-mount
  // state doesn't invite a second upload on top of one already running.
  const awaitingPhoto = !imgs.length && !imagesLoading && !busy;

  // Counts enter/leave pairs rather than toggling on either one, so the
  // highlight doesn't flicker off while the drag crosses a child element's
  // own border (each child fires its own leave+enter as the pointer passes).
  const dragDepth = useRef(0);
  const [isDragOver, setIsDragOver] = useState(false);

  const onDragEnter = (e: React.DragEvent) => {
    if (dropDisabled) return;
    e.preventDefault();
    dragDepth.current += 1;
    setIsDragOver(true);
  };
  const onDragOver = (e: React.DragEvent) => {
    if (dropDisabled) return;
    // Required for the element to become a valid drop target at all.
    e.preventDefault();
  };
  const onDragLeave = (e: React.DragEvent) => {
    if (dropDisabled) return;
    e.preventDefault();
    dragDepth.current -= 1;
    if (dragDepth.current <= 0) {
      dragDepth.current = 0;
      setIsDragOver(false);
    }
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    dragDepth.current = 0;
    setIsDragOver(false);
    if (dropDisabled) return;
    const file = e.dataTransfer.files?.[0];
    if (file) onUpload(file);
  };

  // Held until the hero photograph settles, so the label never appears
  // before the picture it describes. Deliberately one-way: an edit made
  // after the card has already settled once (swapping the photo) fades the
  // new plate in on its own rather than hiding the label again.
  const [heroLoaded, setHeroLoaded] = useState(false);
  const captionReady =
    awaitingPhoto || (busy && !imgs.length && !imagesLoading) || heroLoaded;

  // h-full so cards in a desktop row share a height; the caption grows and
  // pushes the action row to the bottom, keeping rows lined up.
  return (
    <li
      // Lets the e2e suite count/target cards without depending on contents.
      data-testid="item-card"
      className={`fade-up group relative flex h-full flex-col overflow-hidden rounded-sm bg-card text-card-foreground ring-1 ring-border card-lift card-lift-hover transition-shadow ${
        isDragOver ? 'ring-2 ring-foreground' : ''
      }`}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {awaitingPhoto ? (
        <AddPhotoPlate onUpload={onUpload} busy={busy} readOnly={readOnly} />
      ) : (
        <ImageGrid
          imgs={imgs}
          itemTitle={item.title}
          onOpenModal={onOpenModal}
          onDelete={onDeleteImage}
          busy={busy}
          loading={imagesLoading}
          pending={pendingUploads}
          priority={priority}
          readOnly={readOnly}
          onHeroReady={() => setHeroLoaded(true)}
        />
      )}

      {captionReady ? (
        <div className="flex flex-1 flex-col gap-2 p-4">
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

          {!readOnly && (
            <Actions
              onEdit={onEditItem}
              onDelete={onDeleteItem}
              onUpload={onUpload}
              busy={busy}
            />
          )}

          <span className="sr-only" aria-live="polite">
            {busy ? t('item_list.uploading') : ''}
          </span>
        </div>
      ) : (
        <CaptionSkeleton />
      )}
    </li>
  );
}

// Handler props (onUpload, onEditItem, ...) are left out of the comparison:
// ItemList recreates them as fresh closures each render, but each only
// closes over `item.id` and stable hook functions, so an old closure
// behaves like a new one as long as `item` itself hasn't changed.
export function itemCardPropsAreEqual(
  prev: ItemCardProps,
  next: ItemCardProps,
): boolean {
  return (
    prev.item === next.item &&
    prev.imgs === next.imgs &&
    prev.pendingUploads === next.pendingUploads &&
    prev.imagesLoading === next.imagesLoading &&
    prev.priority === next.priority &&
    prev.readOnly === next.readOnly
  );
}

export const ItemCard = memo(ItemCardComponent, itemCardPropsAreEqual);
ItemCard.displayName = 'ItemCard';
