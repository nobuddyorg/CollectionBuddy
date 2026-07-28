'use client';
import Image from 'next/image';
import Icon, { IconType } from '../Icon';
import type { ImgEntry } from './types';
import { useI18n } from '../../i18n/useI18n';
import { Spinner } from '../ui/Spinner';

const STRIP_MAX = 4;

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
}: {
  imgs: ImgEntry[];
  itemTitle: string;
  onOpenModal: (url: string) => void;
  onDelete: (img: ImgEntry) => void;
  deletingPath: Set<string>;
  busy: boolean;
}) {
  const { t } = useI18n();

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
    <div key={img.pathFull} className="relative bg-muted">
      <button
        type="button"
        onClick={() => onOpenModal(img.urlFull)}
        className="block w-full"
      >
        <Image
          src={src}
          alt={altFor(index)}
          width={800}
          height={600}
          unoptimized
          loading="lazy"
          className={`${ratio} w-full object-cover cursor-zoom-in`}
        />
      </button>
      {deleteButton(img, small)}
    </div>
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
    return (
      <div className="grid grid-cols-2 gap-px">
        {imgs.map((img, i) =>
          plate(img, i, {
            ratio: 'aspect-square',
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
