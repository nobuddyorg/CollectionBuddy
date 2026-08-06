'use client';
import { useI18n } from '../../i18n/useI18n';
import type { ItemLite, ImgEntry } from './types';
import { Actions, AddPhotoPlate } from './Actions';
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
  pendingUploads = 0,
  imagesLoading = false,
  deletingPath,
  onUpload,
  onEditItem,
  onDeleteItem,
  onDeleteImage,
  onOpenModal,
}: {
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
  onOpenModal: (url: string) => void;
}) {
  const { t } = useI18n();

  const busy = pendingUploads > 0;

  // Nothing to show and nothing still coming: the card leads with an empty
  // mount instead of an add-photo strip, so every card in the stack has the
  // same silhouette whether or not it has been photographed yet. An upload
  // in flight counts as something coming -- the invitation to add a
  // photograph is the wrong thing to show to someone who just did.
  const awaitingPhoto = !imgs.length && !imagesLoading && !busy;

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
    <li className="fade-up group relative flex h-full flex-col overflow-hidden rounded-sm bg-card text-card-foreground ring-1 ring-border card-lift card-lift-hover transition-shadow">
      {awaitingPhoto ? (
        <AddPhotoPlate onUpload={onUpload} busy={busy} />
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
        />
      )}

      {/* The object label. */}
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

        <Actions
          onEdit={onEditItem}
          onDelete={onDeleteItem}
          onUpload={onUpload}
          busy={busy}
        />

        <span className="sr-only" aria-live="polite">
          {busy ? t('item_list.uploading') : ''}
        </span>
      </div>
    </li>
  );
}
