'use client';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from 'react';
import { verifiedUserId } from '../../data/auth';
import {
  createImageRow,
  deleteImageRow,
  imagePrefix,
  listImagePathsForItems,
  listImagesForItems,
  uploadImageObject,
  type ImageListRow,
} from '../../data/images';
import { removeObjectsThenRows } from '../../data/imageRemoval';
import { isPhotoStorageFull, isQuotaExceeded } from '../../data/quota';
import type { ImageEntry } from './types';
import { useConfirm } from '../Confirm/ConfirmProvider';
import { useToast } from '../Toast/ToastProvider';
import { useI18n } from '../../i18n/useI18n';
import type { TranslationKey } from '../../i18n/I18nProvider';
import {
  entryDataOf,
  groupImageRows,
  itemsDueForResigning,
  keepingShown,
  signAllEntries,
  signEntries,
  type ImageEntryData,
} from './imageEntries';
import { extensionForType } from '../../data/photoType';
import { compressPhoto } from '../../lib/imageCompression';
import { restoreAt } from '../../lib/optimistic';

// Re-signs each shown photograph before its own 1h signature expires, so a long-lived tab keeps its thumbnails.
function useSignedUrlRefresh(
  imagesRef: RefObject<Record<string, ImageEntry[]>>,
  refreshAllImages: (itemIds: string[]) => Promise<void>,
) {
  useEffect(() => {
    const maybeRefresh = () => {
      void refreshAllImages(
        itemsDueForResigning(imagesRef.current, Date.now()),
      );
    };
    const interval = setInterval(maybeRefresh, 60_000);
    document.addEventListener('visibilitychange', maybeRefresh);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', maybeRefresh);
    };
  }, [imagesRef, refreshAllImages]);
}

function withoutItems(loading: Set<string>, itemIds: string[]): Set<string> {
  const next = new Set(loading);
  for (const itemId of itemIds) next.delete(itemId);
  return next;
}

/** The app's storage before the owner's quota: deleting her own photographs may not free enough of it. */
function uploadErrorMessage(
  error: unknown,
  t: (key: TranslationKey) => string,
): string {
  if (isPhotoStorageFull(error)) return t('item_list.photo_storage_full_error');
  if (isQuotaExceeded(error)) return t('item_list.photo_quota_error');
  return t('item_list.upload_error');
}

export function useItemImages() {
  const { t } = useI18n();
  const toast = useToast();
  const confirm = useConfirm();
  // A count, not a flag: a second photograph can be handed over while the first still compresses.
  const [pendingUploads, setPendingUploads] = useState<Record<string, number>>(
    {},
  );
  const [images, setImages] = useState<Record<string, ImageEntry[]>>({});
  // Distinct from "has no images", so a card doesn't grow an image region once pictures arrive.
  const [loadingItems, setLoadingItems] = useState<Set<string>>(new Set());
  const imagesRef = useRef(images);

  useEffect(() => {
    imagesRef.current = images;
  }, [images]);

  // Hands entries back rather than storing them, so the caller can settle its own state in one render.
  const fetchItemImages = useCallback(async (itemId: string) => {
    const listed = await listImagesForItems([itemId]);
    if (listed.error !== null) {
      console.error('Failed to list images', listed.error);
      return undefined;
    }
    const grouped = groupImageRows(listed.data);
    const entryData = grouped.get(itemId) ?? new Map();
    const signed = await signEntries([[itemId, entryData]]);
    return signed[itemId];
  }, []);

  const applyGroupedImages = useCallback(
    async (
      itemIds: string[],
      grouped: Map<string, Map<string, ImageEntryData>>,
    ) => {
      const perItem = itemIds.map(
        (itemId) => [itemId, grouped.get(itemId) ?? new Map()] as const,
      );
      const signed = await signEntries(perItem);

      // signEntries sets every key it is given, so spreading it last replaces exactly these items.
      setImages((previous) => ({ ...previous, ...signed }));
      setLoadingItems((previous) => withoutItems(previous, itemIds));
    },
    [],
  );

  // One query for the whole page, not one Storage round trip per item, so nothing gates the first photo.
  const refreshAllImages = useCallback(
    async (itemIds: string[]) => {
      if (itemIds.length === 0) return;
      setLoadingItems((previous) => new Set([...previous, ...itemIds]));
      const listed = await listImagesForItems(itemIds);
      if (listed.error !== null) {
        console.error('Failed to list images', listed.error);
        setImages((previous) => keepingShown(previous, itemIds));
        setLoadingItems((previous) => withoutItems(previous, itemIds));
        return;
      }
      await applyGroupedImages(itemIds, groupImageRows(listed.data));
    },
    [applyGroupedImages],
  );

  // For rows the page read already carried: signing is all that's left.
  const showImages = useCallback(
    async (itemIds: string[], rows: ImageListRow[]) => {
      setLoadingItems((previous) => new Set([...previous, ...itemIds]));
      await applyGroupedImages(itemIds, groupImageRows(rows));
    },
    [applyGroupedImages],
  );

  // The carousel's top-up: signs the photographs past the card's plates only once someone opens them.
  const signAllFor = useCallback(async (itemId: string) => {
    const entries = imagesRef.current[itemId] ?? [];
    const signed = await signAllEntries([[itemId, entryDataOf(entries)]]);
    setImages((previous) => ({ ...previous, ...signed }));
  }, []);

  useSignedUrlRefresh(imagesRef, refreshAllImages);

  const uploadImage = useCallback(
    async (itemId: string, file: File) => {
      try {
        setPendingUploads((previous) => ({
          ...previous,
          [itemId]: (previous[itemId] ?? 0) + 1,
        }));
        const userId = await verifiedUserId();
        if (!userId) throw new Error(t('item_list.no_user_session'));

        const fullFile = await compressPhoto(file, 1000);
        // From the already-downscaled full size; 600px covers strip cells and pair halves at 3x density.
        const thumbnailFile = await compressPhoto(fullFile, 600);

        const base = crypto.randomUUID();
        const pathBase = `${imagePrefix(userId, itemId)}/${base}`;
        const pathFull = `${pathBase}${extensionForType(fullFile.type)}`;
        const pathThumb = `${pathBase}.thumb${extensionForType(thumbnailFile.type)}`;

        const fullUpload = await uploadImageObject(pathFull, fullFile);
        if (fullUpload.error) throw fullUpload.error;

        const thumbnailUpload = await uploadImageObject(
          pathThumb,
          thumbnailFile,
        );
        const thumbnailUploaded = !thumbnailUpload.error;
        if (!thumbnailUploaded) {
          console.warn('Thumbnail upload failed:', thumbnailUpload.error);
        }

        const { error: rowError } = await createImageRow({
          item_id: itemId,
          path_full: pathFull,
          path_thumb: thumbnailUploaded ? pathThumb : null,
          size_bytes: fullFile.size,
        });
        if (rowError) throw rowError;

        // Released in the same synchronous run as the `finally` below, so React batches both into one render.
        const entries = await fetchItemImages(itemId);
        if (entries)
          setImages((previous) => ({ ...previous, [itemId]: entries }));
      } catch (error: unknown) {
        toast.reportError('upload image', error, uploadErrorMessage(error, t));
      } finally {
        setPendingUploads((previous) => {
          const remaining = previous[itemId] - 1;
          const next = { ...previous };
          if (remaining > 0) next[itemId] = remaining;
          else delete next[itemId];
          return next;
        });
      }
    },
    [fetchItemImages, t, toast],
  );

  // The thumbnail goes on confirm; its bytes, then its row, go once the toast's undo window closes.
  const deleteImage = useCallback(
    async (itemId: string, image: ImageEntry) => {
      if (!(await confirm(t('item_list.confirm_delete_image')))) return;

      const index = (images[itemId] ?? []).findIndex(
        (entry) => entry.id === image.id,
      );
      setImages((previous) => ({
        ...previous,
        [itemId]: (previous[itemId] || []).filter(
          (entry) => entry.id !== image.id,
        ),
      }));

      const restore = () => {
        setImages((previous) => ({
          ...previous,
          [itemId]: restoreAt({ list: previous[itemId], index, item: image }),
        }));
      };

      toast.success(t('item_list.delete_image_success'), {
        action: { label: t('common.undo'), onClick: restore },
        onExpire: async () => {
          const { error } = await removeObjectsThenRows({
            paths: [
              image.pathFull,
              ...(image.pathThumb ? [image.pathThumb] : []),
            ],
            deleteRows: () => deleteImageRow(image.id),
          });
          if (!error) return;
          // Back even when only the row delete failed: the row still exists, and deleting it again works.
          toast.reportError(
            'delete image',
            error,
            t('item_list.delete_image_error'),
          );
          restore();
        },
      });
    },
    [confirm, t, toast, images],
  );

  // The item row's cascade takes the images rows with it, so their paths are read before the delete.
  const captureItemImagePaths = useCallback(async (itemId: string) => {
    const listed = await listImagePathsForItems([itemId]);
    if (listed.error !== null) {
      throw new Error('Could not read image paths before delete', {
        cause: listed.error,
      });
    }
    return listed.data;
  }, []);

  const forgetItemImages = useCallback((itemId: string) => {
    setImages((previous) => {
      const next = { ...previous };
      delete next[itemId];
      return next;
    });
  }, []);

  return {
    images,
    loadingItems,
    refreshAllImages,
    showImages,
    signAllFor,
    uploadImage,
    deleteImage,
    captureItemImagePaths,
    forgetItemImages,
    pendingUploads,
  };
}
