'use client';
import { memo, useState } from 'react';
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
  deletingPath: Set<string>;
  onUpload: (file: File) => void;
  onEditItem: () => void;
  onDeleteItem: () => void;
  onDeleteImage: (img: ImgEntry) => void;
  /** Opens the full-size carousel at this photograph's position in `imgs`. */
  onOpenModal: (index: number) => void;
  /** This card is one of the first few on the page -- its hero photograph
   * is likely the LCP element. */
  priority?: boolean;
  /** A category shared with, not owned by, the viewer (#483 follow-up):
   * no edit, delete, or upload control anywhere on the card. */
  readOnly?: boolean;
};

// A specimen mount: the object leads, the label sits underneath. Photos are
// what a collector actually recognises an item by, so they get the top of
// the card and the full width of it.
//
// Entry actions live in the label area rather than floating over the photo:
// a photo carries its own delete control, and two identical trash icons in
// the same corner gave no way to tell which one removed which thing.
function ItemCardComponent({
  item,
  imgs,
  pendingUploads = 0,
  imagesLoading = false,
  deletingPath,
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

  // Nothing to show and nothing still coming: the card leads with an empty
  // mount instead of an add-photo strip, so every card in the stack has the
  // same silhouette whether or not it has been photographed yet. An upload
  // in flight counts as something coming -- the invitation to add a
  // photograph is the wrong thing to show to someone who just did.
  const awaitingPhoto = !imgs.length && !imagesLoading && !busy;

  // Held until the hero photograph has actually settled, so the label
  // never appears before the picture it describes. A card with nothing to
  // wait on -- no photo coming, or one still mid-upload with only a
  // placeholder frame so far -- has nothing to gate on and shows its label
  // straight away; once a real photograph is on the wire, this stays false
  // until that plate reports in. Deliberately one-way: an edit made after
  // the card has already settled once (swapping the photo, say) fades the
  // new plate in on its own rather than hiding the label again (#556).
  const [heroLoaded, setHeroLoaded] = useState(false);
  const captionReady =
    awaitingPhoto || (busy && !imgs.length && !imagesLoading) || heroLoaded;

  // h-full so cards in a desktop row share a height -- ragged card bottoms
  // read as a broken grid. The caption grows and the action row is pushed
  // to the bottom, so those rows line up across the row and the extra space
  // looks intended rather than left over.
  //
  // The card is a discrete object at every width: rounded, and lifted off
  // the paper by a real two-part shadow -- a tight contact shadow plus a
  // wide soft one (`.card-lift`, which carries both and knows what each
  // theme's shadow is made of). The old single `0 1px 2px / 0.06` was
  // invisible against #f4f3ef, which left a 1px hairline ring as the only
  // thing marking where one card ended and the next began.
  return (
    <li
      // Named so the end-to-end suite can count entries and read one without
      // depending on the shape of what is inside it.
      data-testid="item-card"
      className="fade-up group relative flex h-full flex-col overflow-hidden rounded-sm bg-card text-card-foreground ring-1 ring-border card-lift card-lift-hover transition-shadow"
    >
      {awaitingPhoto ? (
        <AddPhotoPlate onUpload={onUpload} busy={busy} readOnly={readOnly} />
      ) : (
        <ImageGrid
          imgs={imgs}
          itemTitle={item.title}
          onOpenModal={onOpenModal}
          onDelete={onDeleteImage}
          deletingPath={deletingPath}
          busy={busy}
          loading={imagesLoading}
          pending={pendingUploads}
          priority={priority}
          readOnly={readOnly}
          onHeroReady={() => setHeroLoaded(true)}
        />
      )}

      {/* The object label. */}
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

// `deletingPath` is one Set shared by every card on the page (ItemList holds
// a single in-flight-deletions set, not one per item), so removing any
// card's photograph anywhere in the grid gives it a new identity and would
// otherwise re-render all of them. Compare only the membership that could
// actually change this card's own render: whether *this card's* image paths
// are in the set, not whether the set itself is the same object.
//
// The handler props (onUpload, onEditItem, ...) are deliberately left out
// of the comparison: ItemList recreates them as fresh closures on every
// render, but each one only ever closes over `item.id` and the stable
// functions from the data hooks, so an old closure behaves identically to a
// new one as long as `item` itself hasn't changed.
function deletingPathIsRelevantlyEqual(
  prev: Set<string>,
  next: Set<string>,
  imgs: ImgEntry[],
): boolean {
  if (prev === next) return true;
  return imgs.every((img) => prev.has(img.pathFull) === next.has(img.pathFull));
}

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
    prev.readOnly === next.readOnly &&
    deletingPathIsRelevantlyEqual(
      prev.deletingPath,
      next.deletingPath,
      next.imgs,
    )
  );
}

export const ItemCard = memo(ItemCardComponent, itemCardPropsAreEqual);
ItemCard.displayName = 'ItemCard';
