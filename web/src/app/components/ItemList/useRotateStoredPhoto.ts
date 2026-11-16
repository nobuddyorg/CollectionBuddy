'use client';

import { useCallback } from 'react';

import type { PhotoUpload } from '../../data/photoType';
import { useI18n } from '../../i18n/useI18n';
import { rotatePhoto } from '../../lib/photoRotation';
import { useToast } from '../Toast/ToastProvider';
import type { ImageEntry } from './types';
import type { RotationEdit } from './useRotationDraft';

type Replace = (
  itemId: string,
  image: ImageEntry,
  photo: PhotoUpload,
) => Promise<void>;

/** A confirmed rotation, encoded once and put in the original's place by `replace`, which reports its own failures. */
export function useRotateStoredPhoto(replace: Replace) {
  const { t } = useI18n();
  const toast = useToast();
  return useCallback(
    async (itemId: string, image: ImageEntry, edit: RotationEdit) => {
      let rotated: PhotoUpload;
      try {
        rotated = await rotatePhoto(edit.source, edit.degrees);
      } catch (error: unknown) {
        toast.reportError('rotate image', error, t('item_list.rotate_error'));
        return;
      }
      await replace(itemId, image, rotated);
    },
    [replace, t, toast],
  );
}
