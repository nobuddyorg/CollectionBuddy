'use client';
import { useState } from 'react';
import Icon, { IconType } from '../Icon';
import type { ImageEntry } from './types';
import { STRIP_MAX } from './imageEntries';
import { useI18n } from '../../i18n/useI18n';
import { Spinner } from '../ui/Spinner';

// Holds the frame and fades the photograph in: a signed URL doesn't mean the bytes have arrived.
function Plate({
  src,
  alt,
  ratio,
  onOpen,
  overlay,
  children,
  priority = false,
  onReady,
}: {
  src: string;
  alt: string;
  ratio: string;
  onOpen: () => void;
  /** Rendered inside the open button, so a click on it is a click on the button. */
  overlay?: React.ReactNode;
  children?: React.ReactNode;
  /** Likely LCP element: fetched eagerly at high priority instead of lazily. */
  priority?: boolean;
  /** Fires once the photograph settles (loaded or failed); ItemCard holds its caption until then. */
  onReady?: () => void;
}) {
  const [loaded, setLoaded] = useState(false);

  const settle = () => {
    setLoaded(true);
    onReady?.();
  };

  return (
    <div className={`relative bg-muted ${!loaded ? 'img-skeleton' : ''}`}>
      <button
        type="button"
        data-testid="open-image"
        onClick={onOpen}
        className="block h-full w-full"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- the static export is unoptimized (no resizing, no srcSet), so next/image is <img> plus runtime */}
        <img
          data-testid="item-image"
          src={src}
          alt={alt}
          decoding="async"
          // No credentials, so the browser doesn't reject Cloudflare's __cf_bm cookie scoped to supabase.co.
          crossOrigin="anonymous"
          loading={priority ? 'eager' : 'lazy'}
          fetchPriority={priority ? 'high' : undefined}
          onLoad={settle}
          onError={settle}
          className={`${ratio} w-full object-cover cursor-zoom-in transition-opacity duration-300 ${
            loaded ? 'opacity-100' : 'opacity-0'
          }`}
        />
        {overlay}
      </button>
      {children}
    </div>
  );
}

// Reserves the frame the moment a photo is handed over, so the caption doesn't shift when it lands.
function PendingPlate({
  ratio,
  small,
  label,
}: {
  ratio: string;
  small: boolean;
  label: string;
}) {
  return (
    <div
      className={`img-skeleton relative w-full ${ratio}`}
      role="status"
      aria-label={label}
    >
      <span className="absolute inset-0 grid place-items-center text-muted-foreground">
        <Spinner size={small ? 'sm' : 'lg'} />
      </span>
    </div>
  );
}

// 1 photo: one full-width plate; 2: an equal pair (front and back); 3+: a hero plus a contact strip.
export function ImageGrid({
  images,
  itemTitle,
  onOpenModal,
  onDelete,
  busy,
  loading = false,
  pending = 0,
  priority = false,
  readOnly = false,
  onHeroReady,
}: {
  images: ImageEntry[];
  itemTitle: string;
  /** Index into `images`, not a URL, so the modal can reach photographs with no strip cell. */
  onOpenModal: (index: number) => void;
  onDelete: (image: ImageEntry) => void;
  busy: boolean;
  /** Listing/signatures still in flight -- not the same as having none. */
  loading?: boolean;
  /** Photographs handed over but not yet on the wall; each gets a frame. */
  pending?: number;
  /** Among the first cards on the page: the hero plate is fetched eagerly, never the strip. */
  priority?: boolean;
  /** Shared category: no per-photograph delete control on any plate. */
  readOnly?: boolean;
  /** Fires once slot 0 settles (loaded or failed); not while slot 0 is still an upload placeholder. */
  onHeroReady?: () => void;
}) {
  const { t } = useI18n();

  // Uploads count toward the layout, so the arrangement holds once the picture lands.
  const total = images.length + pending;

  // Holds the frame while it's unknown whether a picture exists, so the caption doesn't jump later.
  if (loading && !total) {
    return (
      <div
        className="img-skeleton aspect-4/3 w-full"
        role="status"
        aria-label={t('common.loading')}
      />
    );
  }

  if (!total) return null;

  const altFor = (index: number) =>
    t('item_list.image_alt')
      .replace('{title}', itemTitle)
      .replace('{idx}', String(index + 1));

  // Not a trash icon, which means the whole entry: this reads as "take this one off".
  const deleteButton = ({
    image,
    small,
  }: {
    image: ImageEntry;
    small: boolean;
  }) => (
    <button
      data-testid="delete-image"
      aria-label={t('item_list.delete_image')}
      title={t('item_list.delete_image')}
      onClick={() => onDelete(image)}
      disabled={busy}
      className={[
        'absolute top-1.5 right-1.5 flex items-center justify-center rounded-full',
        // No backdrop blur: it costs a backdrop root the browser must re-snapshot on every scroll.
        'bg-black/60 text-white hover:bg-black/80',
        'opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-focus-within:opacity-100 [@media(hover:hover)]:focus-visible:opacity-100',
        'disabled:opacity-60 transition',
        small ? 'w-7 h-7' : 'w-8 h-8',
      ].join(' ')}
    >
      <Icon
        icon={IconType.Close}
        className={small ? 'w-3.5 h-3.5' : 'w-4 h-4'}
        // Trailing override: Close's own default is a thinner 2.
        strokeWidth="2.5"
      />
    </button>
  );

  // Slots past the end of `images` are pending, so a new photo fills the frame standing in for it.
  const slot = (
    index: number,
    {
      ratio,
      small,
      preferThumb = small,
      overflowCount,
    }: {
      ratio: string;
      small: boolean;
      preferThumb?: boolean;
      /** Last strip cell only: a "+N" badge over its thumbnail; the modal still opens to that photograph. */
      overflowCount?: number;
    },
  ) => {
    const image = images[index];
    if (!image)
      return (
        <PendingPlate
          key={`pending-${index}`}
          ratio={ratio}
          small={small}
          label={t('item_list.uploading')}
        />
      );
    // Only reachable after a failed signing moved an unsigned photograph up.
    if (!image.urlFull)
      return (
        <PendingPlate
          key={image.pathFull}
          ratio={ratio}
          small={small}
          label={t('common.loading')}
        />
      );

    const alt = overflowCount
      ? t('item_list.more_images').replace('{count}', String(overflowCount))
      : altFor(index);

    return (
      <Plate
        key={image.pathFull}
        // Separate from `small`: a pair's half is thumbnail-sized but keeps full-size delete controls.
        src={preferThumb ? image.urlThumb || image.urlFull : image.urlFull}
        alt={alt}
        ratio={ratio}
        onOpen={() => onOpenModal(index)}
        priority={priority && index === 0}
        onReady={index === 0 ? onHeroReady : undefined}
        overlay={
          overflowCount ? (
            // aria-hidden: the image's alt already carries this count.
            <div
              aria-hidden="true"
              className="absolute inset-0 flex items-center justify-center bg-black/55"
            >
              <span className="font-label text-base text-white">
                +{overflowCount}
              </span>
            </div>
          ) : undefined
        }
      >
        {!readOnly && deleteButton({ image, small })}
      </Plate>
    );
  };

  // One track per thumbnail avoids dead cells; a fixed height keeps the strip from becoming a second hero.
  const stripStyle = (count: number) => ({
    gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))`,
  });

  if (total === 1) {
    return slot(0, { ratio: 'aspect-4/3', small: false });
  }

  if (total === 2) {
    // Ratio on the cells, not the container: a container aspect isn't hard, so the pair ran ~50px tall.
    return (
      <div className="grid grid-cols-2 gap-px">
        {[0, 1].map((i) =>
          slot(i, {
            ratio: 'aspect-square sm:aspect-2/3',
            small: false,
            preferThumb: true,
          }),
        )}
      </div>
    );
  }

  const stripCount = Math.min(total - 1, STRIP_MAX);

  // Counts the last cell's own photo too, since the badge covers its thumbnail.
  const overflowCount = total - 1 > STRIP_MAX ? total - STRIP_MAX : 0;

  return (
    <div className="w-full">
      {slot(0, { ratio: 'aspect-4/3', small: false })}

      <div className="grid gap-px" style={stripStyle(stripCount)}>
        {Array.from({ length: stripCount }, (_, i) =>
          slot(i + 1, {
            ratio: 'h-20 sm:h-24',
            small: true,
            overflowCount: i === stripCount - 1 ? overflowCount : undefined,
          }),
        )}
      </div>
    </div>
  );
}
