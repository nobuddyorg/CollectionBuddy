'use client';
import Image from 'next/image';
import Icon, { IconType } from '../Icon';
import type { ImgEntry } from './types';
import { useI18n } from '../../i18n/useI18n';
import { Spinner } from '../ui/Spinner';

// The object, full width, at the top of its mount. The first image is the
// specimen shot; any others follow as a thin contact strip beneath it, the
// way a catalogue plate carries detail views.
export function ImageGrid({
  imgs,
  itemTitle,
  isOpen,
  onOpenModal,
  onDelete,
  deletingPath,
  busy,
}: {
  imgs: ImgEntry[];
  itemTitle: string;
  isOpen: boolean;
  onOpenModal: (url: string) => void;
  onDelete: (img: ImgEntry) => void;
  deletingPath: Set<string>;
  busy: boolean;
}) {
  const { t } = useI18n();

  // An item with no photo yet gets no placeholder at all -- a 4:3 empty box
  // is a screenful of dead grey on mobile. The card collapses to its label
  // and the "add image" action still lives in the action row.
  if (!imgs.length) return null;

  const [hero, ...rest] = imgs;
  const strip = rest.slice(0, 4);
  const altFor = (i: number) =>
    t('item_list.image_alt')
      .replace('{title}', itemTitle)
      .replace('{idx}', String(i + 1));

  const deleteButton = (img: ImgEntry, size: 'lg' | 'sm') => (
    <button
      aria-label={t('item_list.delete')}
      title={t('item_list.delete')}
      onClick={() => onDelete(img)}
      disabled={deletingPath.has(img.pathFull) || busy}
      className={[
        isOpen ? 'opacity-100' : 'opacity-0',
        '[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-focus-within:opacity-100',
        'absolute top-1.5 right-1.5 flex items-center justify-center rounded-sm bg-destructive text-destructive-foreground shadow disabled:opacity-60 transition',
        size === 'lg' ? 'w-8 h-8' : 'w-7 h-7',
      ].join(' ')}
    >
      {deletingPath.has(img.pathFull) ? (
        <Spinner size="sm" />
      ) : (
        <Icon
          icon={IconType.Trash}
          className="w-4 h-4"
          stroke="currentColor"
          strokeWidth="2"
          fill="none"
        />
      )}
    </button>
  );

  return (
    <div className="w-full">
      <div className="relative group/hero bg-muted">
        <button
          type="button"
          onClick={() => onOpenModal(hero.urlFull)}
          className="block w-full"
        >
          <Image
            src={hero.urlThumb || hero.urlFull}
            alt={altFor(0)}
            width={640}
            height={480}
            unoptimized
            loading="lazy"
            className="aspect-4/3 w-full object-cover cursor-zoom-in"
          />
        </button>
        {deleteButton(hero, 'lg')}
      </div>

      {!!strip.length && (
        <div
          className="grid gap-px bg-border"
          style={{
            gridTemplateColumns: `repeat(${strip.length}, minmax(0, 1fr))`,
          }}
        >
          {strip.map((img, i) => (
            <div key={img.pathFull} className="relative bg-muted">
              <button
                type="button"
                onClick={() => onOpenModal(img.urlFull)}
                className="block w-full"
              >
                <Image
                  src={img.urlThumb || img.urlFull}
                  alt={altFor(i + 1)}
                  width={160}
                  height={160}
                  unoptimized
                  loading="lazy"
                  className="aspect-square w-full object-cover cursor-zoom-in"
                />
              </button>
              {deleteButton(img, 'sm')}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
