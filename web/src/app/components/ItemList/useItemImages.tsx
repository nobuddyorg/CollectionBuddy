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
import type { Translate } from '../../i18n/I18nProvider';
import {
  entryDataOf,
  entryPaths,
  groupImageRows,
  itemsDueForResigning,
  keepingShown,
  RENDERABLE_PLATES,
  signAllEntries,
  signEntries,
  withoutRows,
} from './imageEntries';
import { extensionForType, type PhotoEncoding } from '../../data/photoType';
import { compressPhoto } from '../../lib/imageCompression';
import { restoreAt } from '../../lib/optimistic';
import { useSyncedRef } from '../../lib/useSyncedRef';

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

// An item forgotten because its entry's delete committed stays forgotten.
function updatingItem(
  itemId: string,
  update: (entries: ImageEntry[]) => ImageEntry[],
) {
  return (previous: Record<string, ImageEntry[]>) =>
    Object.hasOwn(previous, itemId)
      ? { ...previous, [itemId]: update(previous[itemId]) }
      : previous;
}

/** The app's storage before the owner's quota: deleting her own photographs may not free enough of it. */
function uploadErrorMessage(error: unknown, t: Translate): string {
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
  const imagesRef = useSyncedRef(images);
  // Like useItemMutations' list, and kept after the commit: a listing in flight may still carry the row.
  const pendingDeleteIds = useRef(new Set<string>());

  // Hands entries back rather than storing them, so the caller can settle its own state in one render.
  const fetchItemImages = useCallback(async (itemId: string) => {
    const listed = await listImagesForItems([itemId]);
    if (listed.error !== null) {
      console.error('Failed to list images', listed.error);
      return undefined;
    }
    const grouped = groupImageRows(
      withoutRows(listed.data, pendingDeleteIds.current),
    );
    const entryData = grouped.get(itemId) ?? new Map();
    const signed = await signEntries([[itemId, entryData]]);
    return signed[itemId];
  }, []);

  const applyImageRows = useCallback(
    async (itemIds: string[], rows: ImageListRow[]) => {
      const grouped = groupImageRows(
        withoutRows(rows, pendingDeleteIds.current),
      );
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
      await applyImageRows(itemIds, listed.data);
    },
    [applyImageRows],
  );

  // For rows the page read already carried: signing is all that's left.
  const showImages = useCallback(
    async (itemIds: string[], rows: ImageListRow[]) => {
      setLoadingItems((previous) => new Set([...previous, ...itemIds]));
      await applyImageRows(itemIds, rows);
    },
    [applyImageRows],
  );

  // The carousel's top-up: signs the photographs past the card's plates only once someone opens them.
  const signAllFor = useCallback(
    async (itemId: string) => {
      const entries = imagesRef.current[itemId] ?? [];
      const signed = await signAllEntries([[itemId, entryDataOf(entries)]]);
      setImages((previous) => ({ ...previous, ...signed }));
    },
    [imagesRef],
  );

  useSignedUrlRefresh(imagesRef, refreshAllImages);

  const uploadImage = useCallback(
    async (itemId: string, file: File, encoding: PhotoEncoding = 'opaque') => {
      try {
        setPendingUploads((previous) => ({
          ...previous,
          [itemId]: (previous[itemId] ?? 0) + 1,
        }));
        const userId = await verifiedUserId();
        if (!userId) throw new Error('No user session');

        const fullFile = await compressPhoto(file, {
          maxWidthOrHeight: 1000,
          encoding,
        });
        // From the already-downscaled full size; 600px covers strip cells and pair halves at 3x density.
        const thumbnailFile = await compressPhoto(fullFile, {
          maxWidthOrHeight: 600,
          encoding,
        });

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

      const shown = imagesRef.current[itemId] ?? [];
      const index = shown.findIndex((entry) => entry.id === image.id);
      const remaining = shown.filter((entry) => entry.id !== image.id);
      pendingDeleteIds.current.add(image.id);
      setImages((previous) => ({
        ...previous,
        [itemId]: (previous[itemId] || []).filter(
          (entry) => entry.id !== image.id,
        ),
      }));

      const restore = () => {
        pendingDeleteIds.current.delete(image.id);
        setImages(
          updatingItem(itemId, (list) =>
            restoreAt({ list, index, item: image }),
          ),
        );
      };

      toast.success(t('item_list.delete_image_success'), {
        onUndo: restore,
        onExpire: async () => {
          const { error } = await removeObjectsThenRows({
            paths: entryPaths(image),
            deleteRows: () => deleteImageRow({ id: image.id, itemId }),
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

      // A delete moves the next photograph up, and one past the plates was never signed.
      if (
        remaining.slice(0, RENDERABLE_PLATES).some((entry) => !entry.urlFull)
      ) {
        const signed = await signEntries([[itemId, entryDataOf(remaining)]]);
        const signedById = new Map(
          signed[itemId].map((entry) => [entry.id, entry]),
        );
        // Merged by id, not replaced, so an Undo pressed while signing keeps its photograph.
        setImages(
          updatingItem(itemId, (entries) =>
            entries.map((entry) => signedById.get(entry.id) ?? entry),
          ),
        );
      }
    },
    [confirm, t, toast, imagesRef],
  );

  // The item row's cascade takes the images rows with it, so their paths are read before the delete.
  const captureItemImagePaths = useCallback(async (itemId: string) => {
    const listed = await listImagesForItems([itemId]);
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
