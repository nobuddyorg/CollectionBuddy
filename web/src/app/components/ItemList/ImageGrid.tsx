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
          // Fetched in CORS mode with credentials omitted, which makes the
          // browser ignore Set-Cookie on the response. Cloudflare fronts
          // Supabase storage and sets `__cf_bm` scoped to `Domain=supabase.co`
          // -- a public suffix, so browsers are obliged to reject it and say
          // so, once per image (#258). The bucket answers
          // `access-control-allow-origin: *`, so nothing about loading
          // changes; if that ever stopped being true these would fail to
          // render rather than merely warn, which is the risk being taken.
          crossOrigin="anonymous"
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

// A photograph's frame, held from the moment it is handed over. Compressing
// and uploading a phone photo takes seconds, and until it was done the card
// showed no sign of it at all beyond a spinner on a button -- so the picture
// arrived by shoving the caption down, and a second tap on "add" felt like
// the only way to tell whether the first had registered.
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
        <span
          className={`${small ? 'w-4 h-4' : 'w-8 h-8'} rounded-full border-2 border-current/40 border-t-current animate-spin`}
        />
      </span>
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
  pending = 0,
}: {
  imgs: ImgEntry[];
  itemTitle: string;
  onOpenModal: (url: string) => void;
  onDelete: (img: ImgEntry) => void;
  deletingPath: Set<string>;
  busy: boolean;
  /** Listing/signatures still in flight -- not the same as having none. */
  loading?: boolean;
  /** Photographs handed over but not yet on the wall; each gets a frame. */
  pending?: number;
}) {
  const { t } = useI18n();

  // Uploads count towards the layout, so the arrangement a card settles
  // into is the one it already had while the picture was on its way -- the
  // placeholder is replaced in place rather than rearranging the card.
  const total = imgs.length + pending;

  // Reserve the frame while we still don't know whether there is a picture.
  // Rendering nothing and growing an image region later is what pushed the
  // caption and buttons down as the photographs arrived.
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
        // No backdrop blur. It bought nothing behind 55% black sitting on a
        // photograph, and it cost a backdrop root: the browser has to
        // snapshot everything painted under the button every time the card
        // moves, and a snapshot that misses a frame during a fast scroll is
        // drawn as nothing at all. A slightly heavier scrim reads the same.
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
          stroke="currentColor"
          strokeWidth="2.5"
          fill="none"
        />
      )}
    </button>
  );

  // One slot of the arrangement: a photograph if there is one for it yet,
  // and its held frame if it is still being uploaded. Slots past the end of
  // `imgs` are the pending ones, so a new picture fills the frame that was
  // standing in for it.
  const slot = (
    index: number,
    { ratio, small }: { ratio: string; small: boolean },
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

    return (
      <Plate
        key={img.pathFull}
        // The strip cells are about a quarter of a card; everything else
        // spans it, which is wider than the stored thumbnail.
        src={small ? img.urlThumb || img.urlFull : img.urlFull}
        alt={altFor(index)}
        ratio={ratio}
        onOpen={() => onOpenModal(img.urlFull)}
      >
        {deleteButton(img, small)}
      </Plate>
    );
  };

  // The strip takes one track per thumbnail so it never leaves dead cells
  // at the end of the row, and a fixed height rather than a square ratio so
  // two thumbnails spread across the card can't balloon into a second hero.
  const stripStyle = (count: number) => ({
    gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))`,
  });

  if (total === 1) {
    return slot(0, { ratio: 'aspect-4/3', small: false });
  }

  if (total === 2) {
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
        {[0, 1].map((i) =>
          slot(i, { ratio: 'aspect-square sm:aspect-2/3', small: false }),
        )}
      </div>
    );
  }

  const stripCount = Math.min(total - 1, STRIP_MAX);

  return (
    <div className="w-full">
      {slot(0, { ratio: 'aspect-4/3', small: false })}

      <div className="grid gap-px" style={stripStyle(stripCount)}>
        {Array.from({ length: stripCount }, (_, i) =>
          slot(i + 1, { ratio: 'h-20 sm:h-24', small: true }),
        )}
      </div>
    </div>
  );
}
