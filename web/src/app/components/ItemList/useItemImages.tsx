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
  removeImageObjects,
  uploadImageObject,
  type ImageListRow,
} from '../../data/images';
import { isQuotaExceeded } from '../../data/quota';
import type { ImageEntry } from './types';
import { useConfirm } from '../Confirm/ConfirmProvider';
import { useToast } from '../Toast/ToastProvider';
import { useI18n } from '../../i18n/useI18n';
import {
  entryDataOf,
  groupImageRows,
  signAllEntries,
  signEntries,
  type ImageEntryData,
} from './imageEntries';
import { WEBP_COMPRESSION_OPTIONS } from '../../lib/imageCompression';
import { restoreAt } from '../../lib/optimistic';

// Re-signs before Supabase's 1h server-side expiry, so a long-lived tab keeps its thumbnails.
function useSignedUrlRefresh(
  lastSignedAtRef: RefObject<number>,
  imagesRef: RefObject<Record<string, ImageEntry[]>>,
  refreshAllImages: (itemIds: string[]) => Promise<void>,
) {
  useEffect(() => {
    const SIGNED_URL_SERVER_TTL_MS = 3600_000;
    const REFRESH_MARGIN_MS = 5 * 60_000;
    const maybeRefresh = () => {
      if (
        Date.now() - lastSignedAtRef.current <
        SIGNED_URL_SERVER_TTL_MS - REFRESH_MARGIN_MS
      )
        return;
      // Never-signed and empty coincide: nothing enters imagesRef without stamping lastSignedAtRef.
      void refreshAllImages(Object.keys(imagesRef.current));
    };
    const interval = setInterval(maybeRefresh, 60_000);
    document.addEventListener('visibilitychange', maybeRefresh);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', maybeRefresh);
    };
  }, [lastSignedAtRef, imagesRef, refreshAllImages]);
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
  const lastSignedAtRef = useRef(0);

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
    lastSignedAtRef.current = Date.now();
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
      setLoadingItems((previous) => {
        const next = new Set(previous);
        for (const itemId of itemIds) next.delete(itemId);
        return next;
      });
      lastSignedAtRef.current = Date.now();
    },
    [],
  );

  // One query for the whole page, not one Storage round trip per item, so nothing gates the first photo.
  const refreshAllImages = useCallback(
    async (itemIds: string[]) => {
      if (itemIds.length === 0) return;
      setLoadingItems((previous) => new Set([...previous, ...itemIds]));
      const listed = await listImagesForItems(itemIds);
      const grouped =
        listed.error !== null
          ? new Map<string, Map<string, ImageEntryData>>()
          : groupImageRows(listed.data);
      if (listed.error !== null)
        console.error('Failed to list images', listed.error);
      await applyGroupedImages(itemIds, grouped);
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

  useSignedUrlRefresh(lastSignedAtRef, imagesRef, refreshAllImages);

  const uploadImage = useCallback(
    async (itemId: string, file: File) => {
      try {
        setPendingUploads((previous) => ({
          ...previous,
          [itemId]: (previous[itemId] ?? 0) + 1,
        }));
        const userId = await verifiedUserId();
        if (!userId) throw new Error(t('item_list.no_user_session'));

        const { default: imageCompression } =
          await import('browser-image-compression');
        const fullFile = await imageCompression(file, {
          maxWidthOrHeight: 1000,
          ...WEBP_COMPRESSION_OPTIONS,
        });
        // From the already-downscaled full size; 600px covers strip cells and pair halves at 3x density.
        const thumbnailFile = await imageCompression(fullFile, {
          maxWidthOrHeight: 600,
          ...WEBP_COMPRESSION_OPTIONS,
        });

        const base = crypto.randomUUID();
        const pathBase = `${imagePrefix(userId, itemId)}/${base}`;
        const pathFull = `${pathBase}.webp`;
        const pathThumb = `${pathBase}.thumb.webp`;

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
        toast.reportError(
          'upload image',
          error,
          isQuotaExceeded(error)
            ? t('item_list.photo_quota_error')
            : t('item_list.upload_error'),
        );
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

  // The thumbnail goes on confirm; the row and its bytes go once the toast's undo window closes.
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
          const { data, error } = await deleteImageRow(image.id);
          if (error) {
            toast.reportError(
              'delete image',
              error,
              t('item_list.delete_image_error'),
            );
            restore();
            return;
          }

          // Row already gone: a failure below is a storage leak, not data loss.
          const paths = [
            data.path_full,
            ...(data.path_thumb ? [data.path_thumb] : []),
          ];
          const { error: removeError } = await removeImageObjects(paths);
          if (removeError) {
            toast.reportError(
              'remove image bytes',
              removeError,
              t('item_list.delete_image_cleanup_error'),
            );
          }
        },
      });
    },
    [confirm, t, toast, images],
  );

  // The item row's cascade takes the images rows with it, so their paths are read before the delete.
  const captureItemImagePaths = useCallback(async (itemId: string) => {
    const listed = await listImagePathsForItems([itemId]);
    if (listed.error !== null) {
      console.error('Failed to read image paths before delete', listed.error);
      return [];
    }
    return listed.data;
  }, []);

  const removeImageBytes = useCallback(
    async (
      itemId: string,
      paths: { path_full: string; path_thumb: string | null }[],
    ) => {
      const flat = paths.flatMap((row) =>
        row.path_thumb ? [row.path_full, row.path_thumb] : [row.path_full],
      );
      if (flat.length) {
        const { error } = await removeImageObjects(flat);
        if (error) throw error;
      }
      setImages((previous) => {
        const next = { ...previous };
        delete next[itemId];
        return next;
      });
    },
    [],
  );

  return {
    images,
    loadingItems,
    refreshAllImages,
    showImages,
    signAllFor,
    uploadImage,
    deleteImage,
    captureItemImagePaths,
    removeImageBytes,
    pendingUploads,
  };
}
