'use client';
import { memo, useRef, useState } from 'react';
import { useI18n } from '../../i18n/useI18n';
import type { ItemLite, ImageEntry } from './types';
import { Actions, AddPhotoPlate } from './Actions';
import { ImageGrid } from './ImageGrid';
import { CaptionSkeleton } from './Skeleton';
import { labelClasses } from '../ui/labelClasses';

type ItemCardProps = {
  item: ItemLite;
  images: ImageEntry[];
  /** Photographs handed over for this entry that have not landed yet. */
  pendingUploads?: number;
  imagesLoading?: boolean;
  onUpload: (file: File) => void;
  onEditItem: () => void;
  onDeleteItem: () => void;
  onDeleteImage: (image: ImageEntry) => void;
  /** Opens the full-size carousel at this photograph's position in `images`. */
  onOpenModal: (index: number) => void;
  /** Among the first cards on the page: its hero photograph is likely the LCP element. */
  priority?: boolean;
  /** Shared category: no edit, delete, or upload control anywhere on the card. */
  readOnly?: boolean;
};

function ItemCardComponent({
  item,
  images,
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

  // An upload in flight counts as something coming, so the empty mount doesn't invite a second one.
  const awaitingPhoto = !images.length && !imagesLoading && !busy;

  // Counts enter/leave pairs: each child fires its own leave+enter as the pointer crosses it.
  const dragDepth = useRef(0);
  const [isDragOver, setIsDragOver] = useState(false);

  const onDragEnter = (event: React.DragEvent) => {
    if (dropDisabled) return;
    event.preventDefault();
    dragDepth.current += 1;
    setIsDragOver(true);
  };
  const onDragOver = (event: React.DragEvent) => {
    if (dropDisabled) return;
    // Required for the element to become a valid drop target at all.
    event.preventDefault();
  };
  const onDragLeave = (event: React.DragEvent) => {
    if (dropDisabled) return;
    event.preventDefault();
    dragDepth.current -= 1;
    if (dragDepth.current <= 0) {
      dragDepth.current = 0;
      setIsDragOver(false);
    }
  };
  const onDrop = (event: React.DragEvent) => {
    event.preventDefault();
    dragDepth.current = 0;
    setIsDragOver(false);
    if (dropDisabled) return;
    const file = event.dataTransfer.files?.[0];
    if (file) onUpload(file);
  };

  // Deliberately one-way: a later photo swap fades in on its own rather than hiding the label again.
  const [heroLoaded, setHeroLoaded] = useState(false);
  const captionReady =
    awaitingPhoto || (busy && !images.length && !imagesLoading) || heroLoaded;

  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- drag-to-upload is a pointer-only enhancement; AddPhotoPlate's file input is the accessible path
    <li
      data-testid="item-card"
      // outline, not ring: `.card-lift` sets `box-shadow` directly and would win over a box-shadow ring.
      className={`fade-up group relative flex h-full flex-col overflow-hidden rounded-sm bg-card text-card-foreground ring-1 ring-border card-lift card-lift-hover transition-shadow ${
        isDragOver ? 'outline-2 outline-offset-2 outline-foreground' : ''
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
          images={images}
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
          <h3
            data-testid="item-card-title"
            className="font-display text-[0.95rem] leading-snug"
          >
            {item.title}
          </h3>

          {item.description && (
            <p
              data-testid="item-card-description"
              className="text-sm leading-relaxed text-muted-foreground line-clamp-2"
            >
              {item.description}
            </p>
          )}

          {(item.place || !!item.tags.length) && (
            <div className="flex flex-col gap-2 border-t border-border pt-2.5 mt-0.5">
              {item.place && (
                <div
                  data-testid="item-card-place"
                  className={labelClasses('truncate')}
                >
                  {item.place}
                </div>
              )}

              {!!item.tags.length && (
                <div className="flex flex-wrap gap-1">
                  {item.tags.map((tag) => (
                    <span
                      key={tag}
                      data-testid="item-card-tag"
                      className="tag-chip"
                    >
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

// Handlers are left out: each closes over `item.id` and stable hook functions, so a stale one is fine.
export function itemCardPropsAreEqual(
  previous: ItemCardProps,
  next: ItemCardProps,
): boolean {
  return (
    previous.item === next.item &&
    previous.images === next.images &&
    previous.pendingUploads === next.pendingUploads &&
    previous.imagesLoading === next.imagesLoading &&
    previous.priority === next.priority &&
    previous.readOnly === next.readOnly
  );
}

export const ItemCard = memo(ItemCardComponent, itemCardPropsAreEqual);
ItemCard.displayName = 'ItemCard';
