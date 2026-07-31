'use client';
import { useState } from 'react';
import Image from 'next/image';
import Icon, { IconType } from '../Icon';
import type { ImgEntry } from './types';
import { useI18n } from '../../i18n/useI18n';
import { Spinner } from '../ui/Spinner';

const STRIP_MAX = 4;

// Holds the frame while the bytes are still on the wire, then fades the
// photograph in over it. A signed URL existing does not mean the image has
// arrived -- without this the plate is blank white until it does.
function Plate({
  src,
  alt,
  ratio,
  onOpen,
  children,
}: {
  src: string;
  alt: string;
  ratio: string;
  onOpen: () => void;
  children?: React.ReactNode;
}) {
  const [loaded, setLoaded] = useState(false);

  return (
    <div className={`relative bg-muted ${!loaded ? 'img-skeleton' : ''}`}>
      <button type="button" onClick={onOpen} className="block h-full w-full">
        <Image
          src={src}
          alt={alt}
          width={800}
          height={600}
          unoptimized
          loading="lazy"
          onLoad={() => setLoaded(true)}
          onError={() => setLoaded(true)}
          className={`${ratio} w-full object-cover cursor-zoom-in transition-opacity duration-300 ${
            loaded ? 'opacity-100' : 'opacity-0'
          }`}
        />
      </button>
      {children}
    </div>
  );
}

// The layout follows how many photographs there actually are, because the
// common cases are one and two -- and two is usually a matched pair (the
// front and back of a coin, both faces of a stamp). Giving the second shot
// a thumbnail slot under a hero misrepresented that pair as a main image
// plus an afterthought.
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
}: {
  imgs: ImgEntry[];
  itemTitle: string;
  onOpenModal: (url: string) => void;
  onDelete: (img: ImgEntry) => void;
  deletingPath: Set<string>;
  busy: boolean;
  /** Listing/signatures still in flight -- not the same as having none. */
  loading?: boolean;
}) {
  const { t } = useI18n();

  // Reserve the frame while we still don't know whether there is a picture.
  // Rendering nothing and growing an image region later is what pushed the
  // caption and buttons down as the photographs arrived.
  if (loading && !imgs.length) {
    return (
      <div
        className="img-skeleton aspect-4/3 w-full"
        role="status"
        aria-label={t('common.loading')}
      />
    );
  }

  if (!imgs.length) return null;

  const altFor = (i: number) =>
    t('item_list.image_alt')
      .replace('{title}', itemTitle)
      .replace('{idx}', String(i + 1));

  // Deliberately not a red trash icon: that is what removes the whole
  // entry, from the labelled row under the caption. This sits *on* the
  // photograph it affects and reads as "take this one off".
  const deleteButton = (img: ImgEntry, small: boolean) => (
    <button
      aria-label={t('item_list.delete_image')}
      title={t('item_list.delete_image')}
      onClick={() => onDelete(img)}
      disabled={deletingPath.has(img.pathFull) || busy}
      className={[
        'absolute top-1.5 right-1.5 flex items-center justify-center rounded-full',
        'bg-black/55 text-white backdrop-blur-[2px] hover:bg-black/75',
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
          stroke="currentColor"
          strokeWidth="2.5"
          fill="none"
        />
      )}
    </button>
  );

  const plate = (
    img: ImgEntry,
    index: number,
    { ratio, src, small }: { ratio: string; src: string; small: boolean },
  ) => (
    <Plate
      key={img.pathFull}
      src={src}
      alt={altFor(index)}
      ratio={ratio}
      onOpen={() => onOpenModal(img.urlFull)}
    >
      {deleteButton(img, small)}
    </Plate>
  );

  // The strip takes one track per thumbnail so it never leaves dead cells
  // at the end of the row, and a fixed height rather than a square ratio so
  // two thumbnails spread across the card can't balloon into a second hero.
  const stripStyle = (count: number) => ({
    gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))`,
  });

  if (imgs.length === 1) {
    return plate(imgs[0], 0, {
      ratio: 'aspect-4/3',
      // The full render, not the thumbnail: this spans the whole card,
      // which is wider than the stored 250-400px thumb.
      src: imgs[0].urlFull,
      small: false,
    });
  }

  if (imgs.length === 2) {
    // From `sm` up each half is 2:3, so the pair is exactly as tall as the
    // 4:3 box a single image fills: a half-width cell at 2:3 is
    // (W/2) x (3/4 W). Cards side by side then line up.
    //
    // The ratio is set on the cells rather than as `aspect-4/3` on this
    // container: a container aspect is not a hard constraint, so the images
    // inside resolved to their intrinsic height and stretched it, leaving
    // the pair ~50px taller than a single image instead of equal.
    //
    // Below `sm` there is one card per row and nothing to line up against,
    // so the pair keeps its squarer, less aggressively cropped shape.
    return (
      <div className="grid grid-cols-2 gap-px">
        {imgs.map((img, i) =>
          plate(img, i, {
            ratio: 'aspect-square sm:aspect-2/3',
            src: img.urlFull,
            small: false,
          }),
        )}
      </div>
    );
  }

  const [hero, ...rest] = imgs;
  const strip = rest.slice(0, STRIP_MAX);

  return (
    <div className="w-full">
      {plate(hero, 0, {
        ratio: 'aspect-4/3',
        src: hero.urlFull,
        small: false,
      })}

      <div className="grid gap-px" style={stripStyle(strip.length)}>
        {strip.map((img, i) =>
          plate(img, i + 1, {
            ratio: 'h-20 sm:h-24',
            src: img.urlThumb || img.urlFull,
            small: true,
          }),
        )}
      </div>
    </div>
  );
}
