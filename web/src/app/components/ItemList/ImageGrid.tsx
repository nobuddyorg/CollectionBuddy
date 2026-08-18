'use client';
import { useState } from 'react';
import Icon, { IconType } from '../Icon';
import type { ImgEntry } from './types';
import { useI18n } from '../../i18n/useI18n';
import { Spinner } from '../ui/Spinner';

const STRIP_MAX = 4;

// A signed URL existing doesn't mean the image has arrived; holds the frame
// and fades the photograph in over it instead of showing blank white.
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
  /** Rendered *inside* the open button, over the photograph, so a click on
   * it is a click on the button rather than a separate hit target relying
   * on `pointer-events` to fall through to it. */
  overlay?: React.ReactNode;
  children?: React.ReactNode;
  /** Marks this as the likely LCP element: fetched eagerly at high priority
   * instead of lazily. Only ever true for slot 0 of the first few cards. */
  priority?: boolean;
  /** Fires once this plate's photograph has settled (loaded or failed).
   * Only wired up for the hero slot; see `ItemCard`, which holds the
   * caption back until it reports in. */
  onReady?: () => void;
}) {
  const [loaded, setLoaded] = useState(false);

  const settle = () => {
    setLoaded(true);
    onReady?.();
  };

  return (
    <div className={`relative bg-muted ${!loaded ? 'img-skeleton' : ''}`}>
      <button type="button" onClick={onOpen} className="block h-full w-full">
        {/* eslint-disable-next-line @next/next/no-img-element -- next/image
            adds nothing here: the static export runs unoptimized (no
            resizing, no srcSet), so it's just <img> plus extra runtime. */}
        <img
          src={src}
          alt={alt}
          decoding="async"
          // credentials omitted so the browser doesn't reject Cloudflare's
          // `__cf_bm` cookie, scoped to the public suffix supabase.co. The
          // bucket allows origin `*`, so this doesn't change what loads.
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

// Reserves the frame from the moment a photo is handed over, so the upload
// doesn't shove the caption down once it lands.
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

// Layout follows the photo count: two is usually a matched pair (front and
// back of a coin, both faces of a stamp), so a thumbnail-under-hero layout
// misrepresented it as a main image plus an afterthought.
//
//   1   a single full-width plate
//   2   two equal halves, read as a pair
//   3+  a hero plus a contact strip of the rest
export function ImageGrid({
  imgs,
  itemTitle,
  onOpenModal,
  onDelete,
  deletingPath,
  busy,
  loading = false,
  pending = 0,
  priority = false,
  readOnly = false,
  onHeroReady,
}: {
  imgs: ImgEntry[];
  itemTitle: string;
  /** Index into `imgs`, not a URL, so the modal can navigate to
   * photographs with no strip cell of their own. */
  onOpenModal: (index: number) => void;
  onDelete: (img: ImgEntry) => void;
  deletingPath: Set<string>;
  busy: boolean;
  /** Listing/signatures still in flight -- not the same as having none. */
  loading?: boolean;
  /** Photographs handed over but not yet on the wall; each gets a frame. */
  pending?: number;
  /** Card is among the first few on the page: hero plate is fetched
   * eagerly at high priority. Never applies to the strip. */
  priority?: boolean;
  /** Category shared with, not owned by, the viewer: no per-photograph
   * delete control on any plate. */
  readOnly?: boolean;
  /** Fires once the hero plate (slot 0) has settled (loaded or failed).
   * Doesn't fire while slot 0 is still an upload placeholder. */
  onHeroReady?: () => void;
}) {
  const { t } = useI18n();

  // Uploads count toward the layout so the arrangement doesn't change once
  // the picture lands; the placeholder is replaced in place.
  const total = imgs.length + pending;

  // Reserves the frame while it's unknown whether a picture exists;
  // rendering nothing and growing the region later pushed the caption down.
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

  const altFor = (i: number) =>
    t('item_list.image_alt')
      .replace('{title}', itemTitle)
      .replace('{idx}', String(i + 1));

  // Deliberately not a red trash icon: that removes the whole entry. This
  // sits on the photograph it affects and reads as "take this one off".
  const deleteButton = (img: ImgEntry, small: boolean) => (
    <button
      aria-label={t('item_list.delete_image')}
      title={t('item_list.delete_image')}
      onClick={() => onDelete(img)}
      disabled={deletingPath.has(img.pathFull) || busy}
      className={[
        'absolute top-1.5 right-1.5 flex items-center justify-center rounded-full',
        // No backdrop blur: it buys nothing over 55% black on a photograph,
        // and costs a backdrop root the browser must re-snapshot every scroll.
        'bg-black/60 text-white hover:bg-black/80',
        'opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-focus-within:opacity-100 [@media(hover:hover)]:focus-visible:opacity-100',
        'disabled:opacity-60 transition',
        small ? 'w-7 h-7' : 'w-8 h-8',
      ].join(' ')}
    >
      {deletingPath.has(img.pathFull) ? (
        <Spinner size="sm" />
      ) : (
        <Icon
          icon={IconType.Close}
          className={small ? 'w-3.5 h-3.5' : 'w-4 h-4'}
          // Trailing override: Close's own default is a thinner 2.
          strokeWidth="2.5"
        />
      )}
    </button>
  );

  // A slot: a photograph if present, else its pending frame. Slots past
  // the end of `imgs` are pending, so a new photo fills the frame that was
  // standing in for it.
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
      /** Set only on the last strip cell when more photos exist than the
       * strip shows. Covers the cell's own thumbnail with a "+N" badge;
       * the modal still opens to the (unchanged) photograph underneath. */
      overflowCount?: number;
    },
  ) => {
    const img = imgs[index];
    if (!img)
      return (
        <PendingPlate
          key={`pending-${index}`}
          ratio={ratio}
          small={small}
          label={t('item_list.uploading')}
        />
      );

    const alt = overflowCount
      ? t('item_list.more_images').replace('{count}', String(overflowCount))
      : altFor(index);

    return (
      <Plate
        key={img.pathFull}
        // preferThumb is separate from `small`: a pair's half is only
        // ~178 CSS px, thumbnail-sized, but keeps full-size delete controls.
        src={preferThumb ? img.urlThumb || img.urlFull : img.urlFull}
        alt={alt}
        ratio={ratio}
        onOpen={() => onOpenModal(index)}
        priority={priority && index === 0}
        onReady={index === 0 ? onHeroReady : undefined}
        overlay={
          overflowCount ? (
            // aria-hidden: the image's alt already carries this; this is
            // the sighted-user copy, not a second announcement.
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
        {!readOnly && deleteButton(img, small)}
      </Plate>
    );
  };

  // One grid track per thumbnail avoids dead cells at the row's end; fixed
  // height (not a square ratio) keeps the strip from ballooning into a
  // second hero.
  const stripStyle = (count: number) => ({
    gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))`,
  });

  if (total === 1) {
    return slot(0, { ratio: 'aspect-4/3', small: false });
  }

  if (total === 2) {
    // Each half is 2:3 from `sm` up, matching the height of a single 4:3
    // image so cards line up. The ratio is set on the cells rather than as
    // a container aspect: a container aspect isn't a hard constraint, so
    // images resolved to their intrinsic height and left the pair ~50px
    // taller than a single image. Below `sm` there's one card per row, so
    // the pair keeps its squarer crop.
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

  // Includes the last strip cell's own photo in the count, since its
  // thumbnail is about to be covered by the badge too.
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
