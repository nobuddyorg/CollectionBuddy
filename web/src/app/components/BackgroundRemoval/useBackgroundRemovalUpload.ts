'use client';

import { useCallback, useState } from 'react';
import type { PhotoUpload } from '../../data/photoType';
import { useI18n } from '../../i18n/useI18n';
import { useSyncedRef } from '../../lib/useSyncedRef';
import { useToast } from '../Toast/ToastProvider';
import { readBackgroundRemovalEnabled } from './useBackgroundRemovalPreference';

type Upload = (itemId: string, photo: PhotoUpload) => Promise<void>;

export type PendingCutout = { itemId: string; file: File };

export type CutoutChoice =
  { kind: 'cut-out'; blob: Blob } | { kind: 'original' } | { kind: 'cancel' };

/** Routes a picked photo past the cut-out review when this browser opted in; otherwise straight to `upload`, as before. */
export function useBackgroundRemovalUpload(upload: Upload) {
  const { t } = useI18n();
  const toast = useToast();
  const [pending, setPending] = useState<PendingCutout | null>(null);
  // Read at call time: ItemCard's memo keeps an old handler, which must still see a toggle flipped since.
  const latest = useSyncedRef({ upload, t, toast });

  const pickPhoto = (itemId: string, file: File) => {
    if (!readBackgroundRemovalEnabled()) {
      void latest.current.upload(itemId, { file });
      return;
    }
    if (!file.type.startsWith('image/')) {
      latest.current.toast.error(
        latest.current.t('background_removal.not_an_image'),
      );
      return;
    }
    setPending({ itemId, file });
  };

  const choose = useCallback(
    (choice: CutoutChoice) => {
      setPending(null);
      if (pending === null || choice.kind === 'cancel') return;
      if (choice.kind === 'original') {
        void upload(pending.itemId, { file: pending.file });
        return;
      }
      const cutout = new File([choice.blob], 'cutout.png', {
        type: 'image/png',
      });
      void upload(pending.itemId, { file: cutout, encoding: 'transparent' });
    },
    [pending, upload],
  );

  return { pending, pickPhoto, choose };
}
