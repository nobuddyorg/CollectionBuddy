'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { downloadImageObject } from '../../data/images';
import type { PhotoUpload } from '../../data/photoType';
import { useI18n } from '../../i18n/useI18n';
import { assessSharpness } from '../../lib/photoSharpness';
import { useSyncedRef } from '../../lib/useSyncedRef';
import type { ImageEntry } from '../ItemList/types';
import { useToast } from '../Toast/ToastProvider';
import {
  enqueuePick,
  enqueueStored,
  judged,
  nextStep,
  splitImages,
  withoutHead,
  withoutPick,
  type QueuedPhoto,
} from './photoBatch';
import { readBackgroundRemovalEnabled } from './useBackgroundRemovalPreference';

type Upload = (itemId: string, photo: PhotoUpload) => Promise<void>;
type Replace = (
  itemId: string,
  image: ImageEntry,
  photo: PhotoUpload,
) => Promise<void>;

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

/** Checks each picked photo for blur, then routes it past the review it needs, if any, and on to `upload` in pick order; a stored photo's cut-out goes to `replace`. */
export function useBackgroundRemovalUpload(upload: Upload, replace: Replace) {
  const { t } = useI18n();
  const toast = useToast();
  const [queue, setQueue] = useState<readonly QueuedPhoto[]>([]);
  const picks = useRef(0);
  // Read at call time: ItemCard's memo keeps an old handler, which must still see a toggle flipped since.
  const latest = useSyncedRef({ upload, replace, t, toast });
  // Decided photos upload in decision order, so the first picked stays the cover; `upload` reports its own failures.
  const uploadsSoFar = useRef<Promise<void>>(Promise.resolve());
  const head = queue.at(0);
  const latestHead = useSyncedRef(head);

  const queueUpload = useCallback(
    (photo: QueuedPhoto, upload: PhotoUpload) => {
      const { target } = photo;
      uploadsSoFar.current = uploadsSoFar.current.then(() =>
        target.kind === 'replace'
          ? latest.current.replace(photo.itemId, target.image, upload)
          : latest.current.upload(photo.itemId, upload),
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

  const reviewStored = async (itemId: string, image: ImageEntry) => {
    const { data, error } = await downloadImageObject(image.pathFull);
    if (error) {
      latest.current.toast.reportError(
        'load photo for background removal',
        error,
        latest.current.t('item_list.remove_background_load_error'),
      );
      return;
    }
    picks.current += 1;
    const pick = picks.current;
    const file = new File([data], 'photo', { type: data.type });
    setQueue((waiting) =>
      enqueueStored(waiting, { pick, itemId, image, file }),
    );
  };

  const headKey = head?.key;
  useEffect(() => {
    const photo = latestHead.current;
    if (photo?.sharpness !== 'checking') return;
    let current = true;
    void assessSharpness(photo.file).then((sharpness) => {
      if (!current) return;
      if (nextStep({ ...photo, sharpness }) === 'upload') {
        queueUpload(photo, { file: photo.file });
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
      // A stored photo kept as it is needs nothing done.
      if (head.target.kind === 'replace' && choice.kind === 'original') return;
      queueUpload(head, photoFor(choice, head.file));
    },
    [head, queueUpload],
  );

  const pending = head && nextStep(head) === 'ask' ? head : null;

  return { pending, pickPhotos, reviewStored, choose };
}
