'use client';
import { useState } from 'react';
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
  overlay,
  children,
  priority = false,
  onReady,
}: {
  src: string;
  alt: string;
  ratio: string;
  onOpen: () => void;
  /** Rendered *inside* the open button, over the photograph -- so a click
   * on it is a click on the button (the "+N" badge opens the same modal
   * a tap on the thumbnail underneath it would have, #304), not a second,
   * separate hit target relying on `pointer-events` to fall through to it. */
  overlay?: React.ReactNode;
  children?: React.ReactNode;
  /** This plate is (or is likely to be) the LCP element -- fetched eagerly
   * at high priority instead of lazily, same as next/image's old `priority`
   * prop. Only ever true for slot 0 of one of the first few cards. */
  priority?: boolean;
  /** Told once this plate's own photograph has settled (loaded or failed).
   * Only ever wired up for the hero slot -- see `ItemCard`, which holds the
   * caption back until its card's hero plate reports in (#556). */
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
            earns nothing here: the static export runs with
            images.unoptimized (no resizing, no format negotiation, no
            srcSet), so it was a plain <img> plus extra client-side runtime.
            The dropped width/height were fiction anyway -- the real boxes
            are aspect-square/aspect-2/3/h-20, not the declared 800x600. */}
        <img
          src={src}
          alt={alt}
          decoding="async"
          // Fetched in CORS mode with credentials omitted, which makes the
          // browser ignore Set-Cookie on the response. Cloudflare fronts
          // Supabase storage and sets `__cf_bm` scoped to `Domain=supabase.co`
          // -- a public suffix, so browsers are obliged to reject it and say
          // so, once per image (#258). The bucket answers
          // `access-control-allow-origin: *`, so nothing about loading
          // changes; if that ever stopped being true these would fail to
          // render rather than merely warn, which is the risk being taken.
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
        <Spinner size={small ? 'sm' : 'lg'} />
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
  priority = false,
  readOnly = false,
  onHeroReady,
}: {
  imgs: ImgEntry[];
  itemTitle: string;
  /** Opens the full-size carousel starting at this photograph's position
   * in `imgs` -- an index rather than a URL, so the modal can navigate to
   * every photograph, including ones with no strip cell of their own. */
  onOpenModal: (index: number) => void;
  onDelete: (img: ImgEntry) => void;
  deletingPath: Set<string>;
  busy: boolean;
  /** Listing/signatures still in flight -- not the same as having none. */
  loading?: boolean;
  /** Photographs handed over but not yet on the wall; each gets a frame. */
  pending?: number;
  /** This card is one of the first few on the page, so its hero plate is
   * likely the LCP element -- fetched eagerly at high priority rather than
   * lazily. Never applies to the strip; only slot 0 is ever the hero. */
  priority?: boolean;
  /** A category shared with, not owned by, the viewer (#483 follow-up): no
   * per-photograph delete control on any plate. */
  readOnly?: boolean;
  /** The hero plate (slot 0) has settled -- loaded or failed. Only fires
   * when slot 0 holds an actual photograph; a still-uploading placeholder
   * there has nothing to report (#556). */
  onHeroReady?: () => void;
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
          // Trailing override: Close's own default is a thinner 2.
          strokeWidth="2.5"
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
    {
      ratio,
      small,
      preferThumb = small,
      overflowCount,
    }: {
      ratio: string;
      small: boolean;
      preferThumb?: boolean;
      /** Set only on the last strip cell when photographs beyond `imgs`'
       * strip allowance exist. Covers this cell's own thumbnail with a
       * "+N" badge rather than hiding it -- the photograph underneath is
       * still this same index, so opening the modal from here already
       * lands on the first one the strip had no room for (#304). */
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
        // `preferThumb` is its own flag, not just `small`: a two-up half is
        // full plate chrome (`small: false`, a full-size delete control) at
        // ~178 CSS px -- closer to the strip's quarter-card cells than to a
        // hero's full width, so it reads from the thumbnail too (#289)
        // without shrinking the controls sized for a much bigger plate.
        src={preferThumb ? img.urlThumb || img.urlFull : img.urlFull}
        alt={alt}
        ratio={ratio}
        onOpen={() => onOpenModal(index)}
        priority={priority && index === 0}
        onReady={index === 0 ? onHeroReady : undefined}
        overlay={
          overflowCount ? (
            // aria-hidden: the accessible name already carries this via
            // the image's own alt above -- this is the sighted-user copy
            // of it, not a second announcement.
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
          slot(i, {
            ratio: 'aspect-square sm:aspect-2/3',
            small: false,
            // Each half is ~178 CSS px (a card is ~360px, halved), so the
            // 1000px full image was ~6x the pixel count the slot can show
            // at 2x DPR. `small: false` keeps the full-size delete control
            // a pair's larger plate calls for.
            preferThumb: true,
          }),
        )}
      </div>
    );
  }

  const stripCount = Math.min(total - 1, STRIP_MAX);

  // A photograph beyond the strip's last cell used to have nowhere to be
  // reached from at all -- not rendered, not deletable, still billed
  // against storage (#304). `total - STRIP_MAX` counts everyone that
  // situation now applies to, *including* the photograph the last cell
  // would otherwise have shown on its own: that cell's thumbnail is about
  // to be covered by the badge instead, so it is exactly as unreachable by
  // itself as the ones after it, and the modal it opens is where all of
  // them -- including it -- become reachable.
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
