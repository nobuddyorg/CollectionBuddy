'use client';

import { useCallback, useRef, useState } from 'react';
import type { PhotoUpload } from '../../data/photoType';
import { useI18n } from '../../i18n/useI18n';
import { useSyncedRef } from '../../lib/useSyncedRef';
import { useToast } from '../Toast/ToastProvider';
import {
  afterCurrent,
  positionIn,
  splitImages,
  uploadInOrder,
  type BatchPosition,
  type PhotoBatch,
} from './photoBatch';
import { readBackgroundRemovalEnabled } from './useBackgroundRemovalPreference';

type Upload = (itemId: string, photo: PhotoUpload) => Promise<void>;

export type PendingCutout = {
  itemId: string;
  file: File;
  position: BatchPosition;
};

export type CutoutChoice =
  { kind: 'cut-out'; blob: Blob } | { kind: 'original' } | { kind: 'cancel' };

/** Routes picked photos past the cut-out review when this browser opted in; otherwise straight to `upload`, one after the other. */
export function useBackgroundRemovalUpload(upload: Upload) {
  const { t } = useI18n();
  const toast = useToast();
  const [batch, setBatch] = useState<PhotoBatch | null>(null);
  // Read at call time: ItemCard's memo keeps an old handler, which must still see a toggle flipped since.
  const latest = useSyncedRef({ upload, t, toast });
  // Decided photos upload in decision order, so the first picked stays the cover; `upload` reports its own failures.
  const uploadsSoFar = useRef<Promise<void>>(Promise.resolve());

  const pickPhotos = (itemId: string, files: File[]) => {
    if (!readBackgroundRemovalEnabled()) {
      void uploadInOrder(files, (file) =>
        latest.current.upload(itemId, { file }),
      );
      return;
    }
    const { images, skipped } = splitImages(files);
    if (skipped > 0) {
      latest.current.toast.error(
        latest.current.t('background_removal.not_an_image'),
      );
    }
    if (images.length === 0) return;
    uploadsSoFar.current = Promise.resolve();
    setBatch({ itemId, files: images, total: images.length });
  };

  // Cancelling drops the photos still waiting too: closing the review is the way out of a pick.
  const choose = useCallback(
    (choice: CutoutChoice) => {
      if (batch === null) return;
      setBatch(choice.kind === 'cancel' ? null : afterCurrent(batch));
      if (choice.kind === 'cancel') return;
      const [file] = batch.files;
      const photo: PhotoUpload =
        choice.kind === 'original'
          ? { file }
          : {
              file: new File([choice.blob], 'cutout.png', {
                type: 'image/png',
              }),
              encoding: 'transparent',
            };
      uploadsSoFar.current = uploadsSoFar.current.then(() =>
        upload(batch.itemId, photo),
      );
    },
    [batch, upload],
  );

  const pending: PendingCutout | null = batch && {
    itemId: batch.itemId,
    file: batch.files[0],
    position: positionIn(batch),
  };

  return { pending, pickPhotos, choose };
}
