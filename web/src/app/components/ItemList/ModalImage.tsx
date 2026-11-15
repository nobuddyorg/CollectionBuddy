'use client';

import { useCallback, useRef, useState } from 'react';

import { useI18n } from '../../i18n/useI18n';
import {
  photoBackdropClass,
  usePhotoBackdrop,
} from '../../lib/usePhotoBackdrop';
import { Portal } from '../CenteredModal/Portal';
import { useFocusTrap } from '../CenteredModal/useFocusTrap';
import { useInertBackground } from '../CenteredModal/useInertBackground';
import { useLockBodyScroll } from '../CenteredModal/useLockBodyScroll';
import { useTopmostKeydown } from '../CenteredModal/useTopmostKeydown';
import Icon, { IconType } from '../Icon';
import type { ImageEntry } from './types';
import { StatusSpinner } from '../ui/Spinner';
import type { PhotoUpload } from '../../data/photoType';
import { CropControls, CropPreview } from './CropControls';
import { RotationControls } from './RotationControls';
import { useCropDraft, type CropDraft } from './useCropDraft';
import {
  useRotationDraft,
  type RotationDraft,
  type RotationEdit,
} from './useRotationDraft';
import { ViewerPhoto, type Shown } from './ViewerPhoto';

export function ModalImage({
  images,
  index,
  itemTitle,
  onIndexChange,
  onClose,
  onDelete,
  onRemoveBackground = () => {},
  offerRemoveBackground = false,
  onRotate = async () => {},
  onCrop = async () => {},
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
  onRemoveBackground?: (image: ImageEntry) => void;
  /** Only where this browser opted in to background removal, and only to an editor. */
  offerRemoveBackground?: boolean;
  /** Saves a confirmed rotation; the viewer previews it until then. */
  onRotate?: (image: ImageEntry, edit: RotationEdit) => Promise<void>;
  /** Saves a confirmed crop to the object; offered with background removal, which finds the object. */
  onCrop?: (image: ImageEntry, photo: PhotoUpload) => Promise<void>;
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
  // The chosen backdrop behind a cut-out's see-through background; not behind a failed photo's alt text.
  const [shown, setShown] = useState<Shown>({ path: '', width: 0, height: 0 });
  const { backdrop } = usePhotoBackdrop();
  const rotation = useRotationDraft(onRotate);
  // Only for the photo it was opened on: a delete or a closed viewer leaves it behind.
  const draft: RotationDraft =
    rotation.draft.kind === 'editing' && rotation.draft.image.id === current?.id
      ? rotation.draft
      : { kind: 'closed' };
  const cropping = useCropDraft(onCrop);
  const crop: CropDraft =
    cropping.draft.kind !== 'closed' && cropping.draft.image.id === current?.id
      ? cropping.draft
      : { kind: 'closed' };
  // Either tool holds the viewer: no paging, and Escape or a tap ends the tool, not the viewer.
  const editing = draft.kind === 'editing' || crop.kind !== 'closed';
  const cancelTools = () => {
    rotation.cancel();
    cropping.cancel();
  };
  const close = () => {
    cancelTools();
    onClose();
  };

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
      if (!start || count < 2 || clampedIndex === null || editing) return;
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
    [count, clampedIndex, editing, goTo],
  );

  useLockBodyScroll(open);
  useFocusTrap({ open, containerRef: panelRef });
  useInertBackground(open);

  // One layer for Escape and the arrows alike, so a confirm raised on top takes all three.
  // While rotating or cropping, Escape ends that and the arrows belong to the slider.
  useTopmostKeydown(open, (event) => {
    if (editing) {
      if (event.key === 'Escape') cancelTools();
    } else if (event.key === 'Escape') onClose();
    else if (count > 1 && event.key === 'ArrowLeft') goTo(clampedIndex! - 1);
    else if (count > 1 && event.key === 'ArrowRight') goTo(clampedIndex! + 1);
  });

  if (!current || clampedIndex === null) return null;

  const alt = t('item_list.image_alt', {
    title: itemTitle,
    position: clampedIndex + 1,
  });

  return (
    <Portal>
      <div
        ref={panelRef}
        role="dialog"
        data-testid="image-viewer"
        aria-modal="true"
        aria-label={t('item_list.image_viewer_label')}
        className="fixed inset-0 z-modal bg-background/95 backdrop-blur"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {/* Pinned to the corner: stacked under a max-h-full image it landed past the bottom of the overlay. */}
        <button
          data-testid="close-image"
          onClick={close}
          className="absolute top-[max(0.75rem,env(safe-area-inset-top))] right-3 z-10 w-11 h-11 flex items-center justify-center rounded-sm text-foreground hover:bg-muted transition-colors"
          title={t('common.close')}
          aria-label={t('common.close')}
        >
          <Icon icon={IconType.Close} className="w-5 h-5" />
        </button>

        {!readOnly && (
          <div className="absolute top-[max(0.75rem,env(safe-area-inset-top))] left-3 z-10 flex gap-1">
            {/* The only delete control for photographs past the strip; trash, not a second X beside Close. */}
            <button
              data-testid="delete-image"
              onClick={() => onDelete(current)}
              disabled={busy || editing}
              className={TOOL_CLASSES}
              title={t('item_list.delete_image')}
              aria-label={t('item_list.delete_image')}
            >
              <Icon icon={IconType.Trash} className="w-5 h-5" />
            </button>
            {offerRemoveBackground && (
              <button
                data-testid="remove-background-image"
                onClick={() => onRemoveBackground(current)}
                disabled={busy || editing}
                className={TOOL_CLASSES}
                title={t('item_list.remove_background')}
                aria-label={t('item_list.remove_background')}
              >
                <Icon icon={IconType.Scissors} className="w-5 h-5" />
              </button>
            )}
            <button
              data-testid="rotate-image"
              onClick={() => void rotation.start(current)}
              disabled={busy || editing}
              className={TOOL_CLASSES}
              title={t('item_list.rotate')}
              aria-label={t('item_list.rotate')}
            >
              <Icon icon={IconType.RotateRight} className="w-5 h-5" />
            </button>
            {offerRemoveBackground && (
              <button
                data-testid="crop-image"
                onClick={() => void cropping.start(current)}
                disabled={busy || editing}
                className={TOOL_CLASSES}
                title={t('item_list.crop')}
                aria-label={t('item_list.crop')}
              >
                <Icon icon={IconType.Crop} className="w-5 h-5" />
              </button>
            )}
          </div>
        )}

        {draft.kind === 'editing' && (
          <RotationControls draft={draft} actions={rotation} busy={busy} />
        )}
        {crop.kind !== 'closed' && (
          <CropControls draft={crop} actions={cropping} busy={busy} />
        )}

        {count > 1 && !editing && (
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
              {t('item_list.image_position', {
                current: clampedIndex + 1,
                total: count,
              })}
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

        {/* pb reserves the bottom bar, or the open tool's panel, plus safe area, so a tall photo's edge sits above it. */}
        <div
          className={`absolute inset-0 flex items-center justify-center p-4 pt-16 ${bottomReserve(draft, crop)}`}
          // The preview sizes itself in container units: no measuring, and it follows a resize.
          style={{ containerType: 'size' }}
        >
          {crop.kind === 'ready' && (
            <CropPreview
              crop={crop.crop}
              backdropClass={
                crop.crop.transparent ? photoBackdropClass(backdrop) : ''
              }
            />
          )}
          {crop.kind !== 'ready' && current.urlFull && (
            <ViewerPhoto
              key={current.pathFull}
              image={current}
              alt={alt}
              draft={draft}
              shown={shown}
              backdropClass={photoBackdropClass(backdrop)}
              onLoad={(photo) =>
                setShown({
                  path: current.pathFull,
                  width: photo.naturalWidth,
                  height: photo.naturalHeight,
                })
              }
              onClick={() => {
                if (suppressImageClickRef.current) {
                  suppressImageClickRef.current = false;
                  return;
                }
                if (!editing) onClose();
              }}
            />
          )}
          {/* Past the card's plates, this photograph is signed only now. */}
          {!current.urlFull && (
            <StatusSpinner size="lg" label={t('common.loading')} />
          )}
        </div>
      </div>
    </Portal>
  );
}

function bottomReserve(draft: RotationDraft, crop: CropDraft): string {
  if (draft.kind === 'editing') {
    return 'pb-[calc(12rem+env(safe-area-inset-bottom))]';
  }
  if (crop.kind !== 'closed') {
    return 'pb-[calc(9rem+env(safe-area-inset-bottom))]';
  }
  return 'pb-[calc(3.5rem+env(safe-area-inset-bottom))]';
}

const TOOL_CLASSES =
  'w-11 h-11 flex items-center justify-center rounded-sm text-foreground hover:bg-muted disabled:opacity-60 transition-colors';
