'use client';

import { useState } from 'react';

import { downloadImageObject } from '../../data/images';
import type { PhotoUpload } from '../../data/photoType';
import { useI18n } from '../../i18n/useI18n';
import type { Box, Size } from '../../lib/cutoutImage';
import {
  initialFrame,
  lockedFrame,
  movedFrame,
  pixelBox,
  resizedFrame,
  type Corner,
  type Shift,
} from '../../lib/manualCropFrame';
import { cropPhotoToFrame } from '../../lib/photoFrameCrop';
import { useToast } from '../Toast/ToastProvider';
import type { ImageEntry } from './types';

export type ManualCrop =
  | { kind: 'closed' }
  /** `frame` is in the stored photo's own pixels, `size` its stored size. */
  | {
      kind: 'framing';
      image: ImageEntry;
      size: Size;
      frame: Box;
      locked: boolean;
      saving: boolean;
    };

type Framing = Extract<ManualCrop, { kind: 'framing' }>;

const CLOSED: ManualCrop = { kind: 'closed' };

// Locked to the card's 4:3 from the start: a crop made for the cover should show whole on it.
const STARTS_LOCKED = true;

/** A crop drawn by hand over a stored photo, from its button to Save or Cancel; nothing changes until `save`. */
export function useManualCrop(
  onSave: (image: ImageEntry, photo: PhotoUpload) => Promise<void>,
) {
  const { t } = useI18n();
  const toast = useToast();
  const [crop, setCrop] = useState<ManualCrop>(CLOSED);

  const reframe = (next: (framing: Framing) => Box) =>
    setCrop((current) =>
      current.kind === 'framing' && !current.saving
        ? { ...current, frame: next(current) }
        : current,
    );

  const start = (image: ImageEntry, size: Size) =>
    setCrop({
      kind: 'framing',
      image,
      size,
      frame: initialFrame(size, STARTS_LOCKED),
      locked: STARTS_LOCKED,
      saving: false,
    });

  const move = (from: Box, by: Shift) =>
    reframe(({ size }) => movedFrame(from, by, size));

  const resize = (from: Box, corner: Corner, by: Shift) =>
    reframe(({ size, locked }) =>
      resizedFrame(from, { corner, by, size, locked }),
    );

  const toggleLock = () =>
    setCrop((current) => {
      if (current.kind !== 'framing' || current.saving) return current;
      const locked = !current.locked;
      const frame = locked ? lockedFrame(current.frame) : current.frame;
      return { ...current, locked, frame };
    });

  const cancel = () => setCrop(CLOSED);

  const save = async () => {
    if (crop.kind !== 'framing' || crop.saving) return;
    const { image, frame, size } = crop;
    setCrop({ ...crop, saving: true });
    try {
      const downloaded = await downloadImageObject(image.pathFull);
      if (downloaded.error) {
        toast.reportError(
          'crop photo',
          downloaded.error,
          t('item_list.crop_load_error'),
        );
        return;
      }
      let cropped: PhotoUpload;
      try {
        cropped = await cropPhotoToFrame(
          downloaded.data,
          pixelBox(frame, size),
        );
      } catch (error: unknown) {
        toast.reportError('crop photo', error, t('item_list.crop_error'));
        return;
      }
      await onSave(image, cropped);
    } finally {
      setCrop(CLOSED);
    }
  };

  return { crop, start, move, resize, toggleLock, cancel, save };
}

export type ManualCropApi = ReturnType<typeof useManualCrop>;
