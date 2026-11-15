'use client';

import { coverFirst, setItemCover } from '../../data/cover';
import { useI18n } from '../../i18n/useI18n';
import { useToast } from '../Toast/ToastProvider';
import type { ImageEntry } from './types';

/** Makes a photo its entry's cover: first at once, and back in the stored order if the database refuses. */
export function useMakeCover({
  updateItemImages,
  refreshAllImages,
}: {
  updateItemImages: (
    itemId: string,
    update: (entries: ImageEntry[]) => ImageEntry[],
  ) => void;
  refreshAllImages: (itemIds: string[]) => Promise<void>;
}) {
  const { t } = useI18n();
  const toast = useToast();
  // Not memoized: the viewer's handler calls it, and nothing memoizes that.
  return async (itemId: string, image: ImageEntry) => {
    updateItemImages(itemId, (entries) => coverFirst(entries, image.id));
    const { error } = await setItemCover({ itemId, imageId: image.id });
    if (!error) return;
    toast.reportError('make cover', error, t('item_list.make_cover_error'));
    await refreshAllImages([itemId]);
  };
}
