'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { PhotoUpload } from '../../data/photoType';
import { useI18n } from '../../i18n/useI18n';
import { assessSharpness } from '../../lib/photoSharpness';
import { useSyncedRef } from '../../lib/useSyncedRef';
import { useToast } from '../Toast/ToastProvider';
import {
  enqueuePick,
  judged,
  nextStep,
  splitImages,
  withoutHead,
  withoutPick,
  type QueuedPhoto,
} from './photoBatch';
import { readBackgroundRemovalEnabled } from './useBackgroundRemovalPreference';

type Upload = (itemId: string, photo: PhotoUpload) => Promise<void>;

export type CutoutChoice =
  | { kind: 'cut-out'; blob: Blob }
  | { kind: 'original' }
  | { kind: 'skip' }
  | { kind: 'cancel' };

function photoFor(choice: CutoutChoice, file: File): PhotoUpload {
  if (choice.kind !== 'cut-out') return { file };
  return {
    file: new File([choice.blob], 'cutout.png', { type: 'image/png' }),
    encoding: 'transparent',
  };
}

/** Checks each picked photo for blur, then routes it past the review it needs, if any, and on to `upload` in pick order. */
export function useBackgroundRemovalUpload(upload: Upload) {
  const { t } = useI18n();
  const toast = useToast();
  const [queue, setQueue] = useState<readonly QueuedPhoto[]>([]);
  const picks = useRef(0);
  // Read at call time: ItemCard's memo keeps an old handler, which must still see a toggle flipped since.
  const latest = useSyncedRef({ upload, t, toast });
  // Decided photos upload in decision order, so the first picked stays the cover; `upload` reports its own failures.
  const uploadsSoFar = useRef<Promise<void>>(Promise.resolve());
  const head = queue.at(0);
  const latestHead = useSyncedRef(head);

  const queueUpload = useCallback(
    (itemId: string, photo: PhotoUpload) => {
      uploadsSoFar.current = uploadsSoFar.current.then(() =>
        latest.current.upload(itemId, photo),
      );
    },
    [latest],
  );

  const pickPhotos = (itemId: string, files: File[]) => {
    const { images, skipped } = splitImages(files);
    if (skipped > 0) {
      latest.current.toast.error(
        latest.current.t('background_removal.not_an_image'),
      );
    }
    if (images.length === 0) return;
    picks.current += 1;
    const pick = {
      pick: picks.current,
      itemId,
      files: images,
      removeBackground: readBackgroundRemovalEnabled(),
    };
    setQueue((waiting) => enqueuePick(waiting, pick));
  };

  const headKey = head?.key;
  useEffect(() => {
    const photo = latestHead.current;
    if (headKey === undefined || photo === undefined) return;
    let current = true;
    void assessSharpness(photo.file).then((sharpness) => {
      if (!current) return;
      if (nextStep({ ...photo, sharpness }) === 'upload') {
        queueUpload(photo.itemId, { file: photo.file });
        setQueue((waiting) => withoutHead(waiting, photo));
        return;
      }
      setQueue((waiting) => judged(waiting, photo, sharpness));
    });
    return () => {
      current = false;
    };
  }, [headKey, latestHead, queueUpload]);

  // Cancelling drops the rest of that pick too: closing the review is the way out of a pick.
  const choose = useCallback(
    (choice: CutoutChoice) => {
      if (head === undefined) return;
      if (choice.kind === 'cancel') {
        setQueue((waiting) => withoutPick(waiting, head.pick));
        return;
      }
      setQueue((waiting) => withoutHead(waiting, head));
      if (choice.kind === 'skip') return;
      queueUpload(head.itemId, photoFor(choice, head.file));
    },
    [head, queueUpload],
  );

  const pending = head && nextStep(head) === 'ask' ? head : null;

  return { pending, pickPhotos, choose };
}
