'use client';

import { useCallback, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';

import { useI18n } from '../../i18n/useI18n';
import { useEscapeToClose } from '../CenteredModal/useEscapeToClose';
import { useFocusTrap } from '../CenteredModal/useFocusTrap';
import { useInertBackground } from '../CenteredModal/useInertBackground';
import { useLockBodyScroll } from '../CenteredModal/useLockBodyScroll';
import Icon, { IconType } from '../Icon';
import { Spinner } from '../ui/Spinner';
import type { ImgEntry } from './types';

export function ModalImage({
  imgs,
  index,
  itemTitle,
  onIndexChange,
  onClose,
  onDelete,
  deletingPath,
  busy = false,
}: {
  /** The full set of photographs for the entry this modal was opened from
   * -- not just the ones a strip cell had room for (#304). */
  imgs: ImgEntry[];
  /** Position within `imgs` to show, or `null` while closed. */
  index: number | null;
  itemTitle: string;
  onIndexChange: (index: number) => void;
  onClose: () => void;
  onDelete: (img: ImgEntry) => void;
  deletingPath: Set<string>;
  busy?: boolean;
}) {
  const { t } = useI18n();
  const panelRef = useRef<HTMLDivElement>(null);

  const count = imgs.length;
  // Deleting the photograph currently shown shifts `imgs` under the same
  // `index` -- the array closes over the gap, so the same position now
  // names whatever came after it (or the new last one, if it was the
  // last). Clamping here rather than in the caller is what makes that
  // fall out for free instead of needing its own bookkeeping.
  const clampedIndex =
    index !== null && count > 0
      ? Math.min(Math.max(index, 0), count - 1)
      : null;
  const open = clampedIndex !== null;
  const current = open ? imgs[clampedIndex] : null;

  const goTo = useCallback(
    (i: number) => {
      if (count === 0) return;
      onIndexChange(((i % count) + count) % count);
    },
    [count, onIndexChange],
  );

  // #484: the Previous/Next buttons sit over the photograph itself, which
  // is fine with a mouse (there's room beside a cursor-sized target) but on
  // a narrow phone screen covers real image content. Swipe is the touch
  // equivalent of those buttons -- a horizontal drag past the threshold
  // steps the same way a click on them would -- so the buttons can hide on
  // touch devices ([@media(hover:none)] below) without losing the gesture
  // that replaces them.
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const SWIPE_THRESHOLD_PX = 50;

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStartRef.current = touch
      ? { x: touch.clientX, y: touch.clientY }
      : null;
  }, []);

  const onTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      const start = touchStartRef.current;
      touchStartRef.current = null;
      if (!start || count < 2 || clampedIndex === null) return;
      const touch = e.changedTouches[0];
      if (!touch) return;
      const dx = touch.clientX - start.x;
      const dy = touch.clientY - start.y;
      // Horizontal enough to be a swipe rather than a vertical wobble or a
      // pinch -- the same photograph-inspection gestures #355 already had
      // to tell apart from a dismiss tap.
      if (Math.abs(dx) < SWIPE_THRESHOLD_PX || Math.abs(dx) < Math.abs(dy)) {
        return;
      }
      goTo(dx < 0 ? clampedIndex + 1 : clampedIndex - 1);
    },
    [count, clampedIndex, goTo],
  );

  useLockBodyScroll(open);
  useEscapeToClose(open, onClose);
  useFocusTrap(open, panelRef);
  useInertBackground(open);

  // ArrowLeft/ArrowRight cycle through every photograph, matching the
  // Escape-to-close pattern already used by this modal (and Pagination's
  // own Previous/Next) rather than inventing a new convention.
  useEffect(() => {
    if (!open || count < 2 || clampedIndex === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (e.key === 'ArrowLeft') goTo(clampedIndex - 1);
      else if (e.key === 'ArrowRight') goTo(clampedIndex + 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, count, clampedIndex, goTo]);

  if (!current || clampedIndex === null || typeof document === 'undefined')
    return null;

  const alt = t('item_list.image_alt')
    .replace('{title}', itemTitle)
    .replace('{idx}', String(clampedIndex + 1));

  const deleting = deletingPath.has(current.pathFull);

  return ReactDOM.createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-label={t('item_list.full_size_image_alt')}
      className="fixed inset-0 z-modal bg-background/95 backdrop-blur"
      onClick={onClose}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* Pinned to the corner, not stacked under the image: with the image
          free to take max-h-full, a button below it landed past the bottom
          of a fixed, unscrollable overlay and could not be reached. */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className="absolute top-[max(0.75rem,env(safe-area-inset-top))] right-3 z-10 w-11 h-11 flex items-center justify-center rounded-sm bg-card text-card-foreground ring-1 ring-control-border shadow-sm hover:bg-muted transition-colors"
        title={t('item_list.close_modal')}
        aria-label={t('item_list.close_modal')}
      >
        <Icon icon={IconType.Close} className="w-5 h-5" />
      </button>

      {/* Deliberately Trash rather than the strip's small X: this sits in
          the corner opposite Close (also an X), where a second X would be
          read as another way to dismiss the modal instead of the photo
          underneath it. Reachable here because the strip's own delete
          button only exists on a rendered Plate -- photographs past the
          strip limit never had one (#304). */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete(current);
        }}
        disabled={deleting || busy}
        className="absolute top-[max(0.75rem,env(safe-area-inset-top))] left-3 z-10 w-11 h-11 flex items-center justify-center rounded-sm bg-card text-card-foreground ring-1 ring-border shadow-sm hover:bg-muted disabled:opacity-60 transition-colors"
        title={t('item_list.delete_image')}
        aria-label={t('item_list.delete_image')}
      >
        {deleting ? (
          <Spinner size="sm" />
        ) : (
          <Icon icon={IconType.Trash} className="w-5 h-5" />
        )}
      </button>

      {count > 1 && (
        <>
          <button
            onClick={(e) => {
              e.stopPropagation();
              goTo(clampedIndex - 1);
            }}
            // Hidden where there's no hover-capable pointer -- a touch
            // screen already has the swipe gesture above, and the button
            // sitting at the image's edge covers real photo content there.
            className="absolute top-1/2 left-3 z-10 -translate-y-1/2 w-11 h-11 items-center justify-center rounded-sm bg-card text-card-foreground ring-1 ring-border shadow-sm hover:bg-muted transition-colors hidden [@media(hover:hover)]:flex"
            title={t('item_list.previous_image')}
            aria-label={t('item_list.previous_image')}
          >
            <Icon icon={IconType.ChevronLeft} className="w-5 h-5" />
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation();
              goTo(clampedIndex + 1);
            }}
            className="absolute top-1/2 right-3 z-10 -translate-y-1/2 w-11 h-11 items-center justify-center rounded-sm bg-card text-card-foreground ring-1 ring-border shadow-sm hover:bg-muted transition-colors hidden [@media(hover:hover)]:flex"
            title={t('item_list.next_image')}
            aria-label={t('item_list.next_image')}
          >
            <Icon icon={IconType.ChevronRight} className="w-5 h-5" />
          </button>

          <div
            aria-live="polite"
            className="absolute bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-1/2 z-10 -translate-x-1/2 rounded-sm bg-card px-2.5 py-1 font-label text-[0.6875rem] text-card-foreground ring-1 ring-border shadow-sm"
          >
            {t('item_list.image_position')
              .replace('{current}', String(clampedIndex + 1))
              .replace('{total}', String(count))}
          </div>
        </>
      )}

      <div className="absolute inset-0 flex items-center justify-center p-4 pt-16 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {/* eslint-disable-next-line @next/next/no-img-element -- next/image
            earns nothing on this static export (images.unoptimized), and
            the width={0} height={0} sizes="100vw" it needed here was
            already the documented workaround for "let CSS size this
            unconstrained" -- a plain <img> does that natively. */}
        <img
          key={current.pathFull}
          src={current.urlFull}
          alt={alt}
          decoding="async"
          // Same reasoning as the grid: see the note in ImageGrid.tsx.
          crossOrigin="anonymous"
          className="w-auto h-auto max-w-full max-h-full object-contain rounded-sm shadow-lg"
          // Without this, any tap on the photo itself -- including the tail
          // end of a pinch-zoom or drag gesture -- bubbles to the overlay's
          // onClose and dismisses the lightbox at exactly the moment the
          // photo is being inspected. The surrounding backdrop, not covered
          // by the image, stays the dismiss area.
          onClick={(e) => e.stopPropagation()}
        />
      </div>
    </div>,
    document.body,
  );
}
