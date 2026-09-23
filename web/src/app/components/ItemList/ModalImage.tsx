'use client';

import { useCallback, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';

import { useI18n } from '../../i18n/useI18n';
import { useEscapeToClose } from '../CenteredModal/useEscapeToClose';
import { useFocusTrap } from '../CenteredModal/useFocusTrap';
import { useInertBackground } from '../CenteredModal/useInertBackground';
import { useLockBodyScroll } from '../CenteredModal/useLockBodyScroll';
import Icon, { IconType } from '../Icon';
import type { ImageEntry } from './types';
import { Spinner } from '../ui/Spinner';

export function ModalImage({
  images,
  index,
  itemTitle,
  onIndexChange,
  onClose,
  onDelete,
  busy = false,
  readOnly = false,
}: {
  /** Every photograph of the entry, not just the ones a strip cell had room for. */
  images: ImageEntry[];
  /** Position within `images` to show, or `null` while closed. */
  index: number | null;
  itemTitle: string;
  onIndexChange: (index: number) => void;
  onClose: () => void;
  onDelete: (image: ImageEntry) => void;
  busy?: boolean;
  /** Shared category: no delete control in the carousel either. */
  readOnly?: boolean;
}) {
  const { t } = useI18n();
  const panelRef = useRef<HTMLDivElement>(null);

  const count = images.length;
  // Clamped here, not by the caller: deleting the shown photograph shifts `images` under the same index.
  const clampedIndex =
    index !== null && count > 0
      ? Math.min(Math.max(index, 0), count - 1)
      : null;
  const open = clampedIndex !== null;
  const current = open ? images[clampedIndex] : null;

  const goTo = useCallback(
    (position: number) => {
      onIndexChange(((position % count) + count) % count);
    },
    [count, onIndexChange],
  );

  // Swipe is the touch equivalent of Previous/Next, which cover content on a narrow screen.
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const SWIPE_THRESHOLD_PX = 50;
  // Set when a touch just navigated, so the synthetic click after touchend doesn't close the modal.
  const suppressImageClickRef = useRef(false);

  const onTouchStart = useCallback((event: React.TouchEvent) => {
    const touch = event.touches[0];
    touchStartRef.current = touch
      ? { x: touch.clientX, y: touch.clientY }
      : null;
  }, []);

  const onTouchEnd = useCallback(
    (event: React.TouchEvent) => {
      const start = touchStartRef.current;
      touchStartRef.current = null;
      suppressImageClickRef.current = false;
      if (!start || count < 2 || clampedIndex === null) return;
      const touch = event.changedTouches[0];
      if (!touch) return;
      const deltaX = touch.clientX - start.x;
      const deltaY = touch.clientY - start.y;
      // Horizontal enough to be a swipe rather than a vertical wobble or pinch.
      if (
        Math.abs(deltaX) < SWIPE_THRESHOLD_PX ||
        Math.abs(deltaX) < Math.abs(deltaY)
      ) {
        return;
      }
      suppressImageClickRef.current = true;
      goTo(deltaX < 0 ? clampedIndex + 1 : clampedIndex - 1);
    },
    [count, clampedIndex, goTo],
  );

  useLockBodyScroll(open);
  useEscapeToClose(open, onClose);
  useFocusTrap({ open, containerRef: panelRef });
  useInertBackground(open);

  useEffect(() => {
    if (!open || count < 2) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.key === 'ArrowLeft') goTo(clampedIndex - 1);
      else if (event.key === 'ArrowRight') goTo(clampedIndex + 1);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, count, clampedIndex, goTo]);

  if (!current || clampedIndex === null || typeof document === 'undefined')
    return null;

  const alt = t('item_list.image_alt')
    .replace('{title}', itemTitle)
    .replace('{idx}', String(clampedIndex + 1));

  return ReactDOM.createPortal(
    <div
      ref={panelRef}
      role="dialog"
      data-testid="image-viewer"
      aria-modal="true"
      aria-label={t('item_list.full_size_image_alt')}
      className="fixed inset-0 z-modal bg-background/95 backdrop-blur"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* Pinned to the corner: stacked under a max-h-full image it landed past the bottom of the overlay. */}
      <button
        data-testid="close-image"
        onClick={onClose}
        className="absolute top-[max(0.75rem,env(safe-area-inset-top))] right-3 z-10 w-11 h-11 flex items-center justify-center rounded-sm text-foreground hover:bg-muted transition-colors"
        title={t('item_list.close_modal')}
        aria-label={t('item_list.close_modal')}
      >
        <Icon icon={IconType.Close} className="w-5 h-5" />
      </button>

      {/* The only delete control for photographs past the strip; trash, not a second X beside Close. */}
      {!readOnly && (
        <button
          data-testid="delete-image"
          onClick={() => onDelete(current)}
          disabled={busy}
          className="absolute top-[max(0.75rem,env(safe-area-inset-top))] left-3 z-10 w-11 h-11 flex items-center justify-center rounded-sm text-foreground hover:bg-muted disabled:opacity-60 transition-colors"
          title={t('item_list.delete_image')}
          aria-label={t('item_list.delete_image')}
        >
          <Icon icon={IconType.Trash} className="w-5 h-5" />
        </button>
      )}

      {count > 1 && (
        // One bar on every pointer type: hover-only edge buttons sat over the photograph on touch screens.
        <div
          aria-live="polite"
          className="absolute bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-1/2 z-10 -translate-x-1/2 flex items-center gap-3"
        >
          <button
            data-testid="previous-image"
            onClick={() => goTo(clampedIndex - 1)}
            className="min-w-11 min-h-11 flex items-center justify-center rounded-sm text-foreground hover:bg-muted transition-colors"
            title={t('item_list.previous_image')}
            aria-label={t('item_list.previous_image')}
          >
            <Icon icon={IconType.ChevronLeft} className="w-4 h-4" />
          </button>

          <span
            data-testid="image-position"
            className="font-label text-xs text-muted-foreground"
          >
            {t('item_list.image_position')
              .replace('{current}', String(clampedIndex + 1))
              .replace('{total}', String(count))}
          </span>

          <button
            data-testid="next-image"
            onClick={() => goTo(clampedIndex + 1)}
            className="min-w-11 min-h-11 flex items-center justify-center rounded-sm text-foreground hover:bg-muted transition-colors"
            title={t('item_list.next_image')}
            aria-label={t('item_list.next_image')}
          >
            <Icon icon={IconType.ChevronRight} className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* pb reserves the bottom bar's row plus safe area, so a tall photo's edge sits above the bar. */}
      <div className="absolute inset-0 flex items-center justify-center p-4 pt-16 pb-[calc(3.5rem+env(safe-area-inset-bottom))]">
        {current.urlFull ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- the static export is unoptimized, and tap-to-close is pointer-only: the Close button and Escape cover the keyboard */}
            <img
              key={current.pathFull}
              data-testid="viewer-photo"
              src={current.urlFull}
              alt={alt}
              decoding="async"
              // Same reasoning as the grid: see the note in ImageGrid.tsx.
              crossOrigin="anonymous"
              className="w-auto h-auto max-w-full max-h-full object-contain rounded-sm shadow-lg"
              // A tap closes, except the synthetic click after a swipe that just paged (flagged in onTouchEnd).
              onClick={() => {
                if (suppressImageClickRef.current) {
                  suppressImageClickRef.current = false;
                  return;
                }
                onClose();
              }}
            />
          </>
        ) : (
          // Past the card's plates, this photograph is signed only now.
          <div role="status" aria-label={t('common.loading')}>
            <Spinner size="lg" />
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
