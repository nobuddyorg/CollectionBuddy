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
import type { ImgEntry } from './types';
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

// Refresh signed URLs before Supabase's own 1h server-side expiry so a
// long-lived tab doesn't turn every thumbnail into a broken-image
// placeholder. Distinct from exportCategory.ts's SIGNED_URL_TTL_SECONDS,
// which asks for a longer-lived URL for a different purpose (a slow export
// download outliving it) rather than mirroring this default.
function useSignedUrlRefresh(
  lastSignedAtRef: RefObject<number>,
  imagesRef: RefObject<Record<string, ImgEntry[]>>,
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
      // `refreshAllImages` itself no-ops on an empty list, and nothing ever
      // adds an item to `imagesRef.current` without also stamping
      // `lastSignedAtRef.current` in the same call -- so an empty item set
      // and a never-signed ref are the same case, already handled above.
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
  // A count, not a flag: a card can be given a second photograph while the
  // first is still compressing, and each one owes the grid a placeholder
  // of its own until it lands.
  const [pendingUploads, setPendingUploads] = useState<Record<string, number>>(
    {},
  );
  const [images, setImages] = useState<Record<string, ImgEntry[]>>({});
  // Items whose signatures are still in flight, distinct from "has no
  // images" -- both used to look like an empty array, so a card would grow
  // an image region and shove its caption down the moment pictures arrived.
  const [loadingItems, setLoadingItems] = useState<Set<string>>(new Set());
  const imagesRef = useRef(images);
  const lastSignedAtRef = useRef(0);

  useEffect(() => {
    imagesRef.current = images;
  }, [images]);

  // Always re-queries, since this runs right after an upload changed the
  // answer. Hands entries back rather than storing them, so a caller with
  // other state to settle at the same moment (an upload's placeholder) can
  // apply both in one go instead of rendering in between.
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

  // Signs grouped rows and shows them, in one update for the page.
  const applyGroupedImages = useCallback(
    async (
      itemIds: string[],
      grouped: Map<string, Map<string, ImageEntryData>>,
    ) => {
      const perItem = itemIds.map(
        (itemId) => [itemId, grouped.get(itemId) ?? new Map()] as const,
      );
      const signed = await signEntries(perItem);

      // `signed` already carries one entry per id in `itemIds` --
      // `signEntries` sets every key it's given, even to an empty list -- so
      // spreading it last already replaces exactly those keys with no need
      // to filter them out of `prev` first.
      setImages((prev) => ({ ...prev, ...signed }));
      setLoadingItems((prev) => {
        const next = new Set(prev);
        for (const itemId of itemIds) next.delete(itemId);
        return next;
      });
      lastSignedAtRef.current = Date.now();
    },
    [],
  );

  // One query for the whole page rather than one Storage round trip per
  // item -- removes the wait for the slowest item to gate the first
  // photograph on screen, so there's no per-item progressive reveal here.
  const refreshAllImages = useCallback(
    async (itemIds: string[]) => {
      if (itemIds.length === 0) return;
      setLoadingItems((prev) => new Set([...prev, ...itemIds]));
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

  // For rows the page read already carried (#627): signing is all that's left.
  const showImages = useCallback(
    async (itemIds: string[], rows: ImageListRow[]) => {
      setLoadingItems((prev) => new Set([...prev, ...itemIds]));
      await applyGroupedImages(itemIds, groupImageRows(rows));
    },
    [applyGroupedImages],
  );

  // The carousel's top-up: signs the photographs past the card's plates,
  // through the same cache, only once someone opens them (#630).
  const signAllFor = useCallback(async (itemId: string) => {
    const entries = imagesRef.current[itemId] ?? [];
    const signed = await signAllEntries([[itemId, entryDataOf(entries)]]);
    setImages((prev) => ({ ...prev, ...signed }));
  }, []);

  useSignedUrlRefresh(lastSignedAtRef, imagesRef, refreshAllImages);

  const uploadImage = useCallback(
    async (itemId: string, file: File) => {
      try {
        setPendingUploads((prev) => ({
          ...prev,
          [itemId]: (prev[itemId] ?? 0) + 1,
        }));
        const uid = await verifiedUserId();
        if (!uid) throw new Error(t('item_list.no_user_session'));

        const { default: imageCompression } =
          await import('browser-image-compression');
        const fullFile = await imageCompression(file, {
          maxWidthOrHeight: 1000,
          ...WEBP_COMPRESSION_OPTIONS,
        });
        // Derived from the already-downscaled 1000px image, not the
        // original -- decoding and resizing a 12MP phone JPEG twice roughly
        // doubles wall time and memory for no visible quality difference.
        //
        // 600px, not 400: covers both the ~100px contact-strip cells and a
        // two-up pair's ~178px half at up to 3x pixel density.
        const thumbFile = await imageCompression(fullFile, {
          maxWidthOrHeight: 600,
          ...WEBP_COMPRESSION_OPTIONS,
        });

        const base = crypto.randomUUID();
        const pathBase = `${imagePrefix(uid, itemId)}/${base}`;
        const pathFull = `${pathBase}.webp`;
        const pathThumb = `${pathBase}.thumb.webp`;

        const upFull = await uploadImageObject(pathFull, fullFile);
        if (upFull.error) throw upFull.error;

        const upThumb = await uploadImageObject(pathThumb, thumbFile);
        const thumbUploaded = !upThumb.error;
        if (!thumbUploaded) {
          console.warn('Thumbnail upload failed:', upThumb.error);
        }

        const { error: rowError } = await createImageRow({
          item_id: itemId,
          path_full: pathFull,
          path_thumb: thumbUploaded ? pathThumb : null,
          size_bytes: fullFile.size,
        });
        if (rowError) throw rowError;

        // Placeholder held until the row is back, not just the bytes
        // accepted -- and released in the same synchronous run as `finally`
        // below so React batches both into one render, rather than showing
        // the photograph beside its own placeholder for a frame.
        const entries = await fetchItemImages(itemId);
        if (entries) setImages((prev) => ({ ...prev, [itemId]: entries }));
      } catch (err: unknown) {
        toast.reportError(
          'upload image',
          err,
          isQuotaExceeded(err)
            ? t('item_list.photo_quota_error')
            : t('item_list.upload_error'),
        );
      } finally {
        setPendingUploads((prev) => {
          const remaining = prev[itemId] - 1;
          const next = { ...prev };
          if (remaining > 0) next[itemId] = remaining;
          else delete next[itemId];
          return next;
        });
      }
    },
    [fetchItemImages, t, toast],
  );

  // The thumbnail goes the moment deletion is confirmed; the actual delete
  // is deferred to the toast's undo window (see useToast). Failure or undo
  // puts it back at its original position.
  const deleteImage = useCallback(
    async (itemId: string, img: ImgEntry) => {
      if (!(await confirm(t('item_list.confirm_delete_image')))) return;

      const index = (images[itemId] ?? []).findIndex((e) => e.id === img.id);
      setImages((prev) => ({
        ...prev,
        [itemId]: (prev[itemId] || []).filter((e) => e.id !== img.id),
      }));

      const restore = () => {
        setImages((prev) => ({
          ...prev,
          [itemId]: restoreAt(prev[itemId], index, img),
        }));
      };

      toast.success(t('item_list.delete_image_success'), {
        action: { label: t('common.undo'), onClick: restore },
        onExpire: async () => {
          const { data, error } = await deleteImageRow(img.id);
          if (error) {
            toast.reportError(
              'delete image',
              error,
              t('item_list.delete_image_error'),
            );
            restore();
            return;
          }

          // Row already gone here. A failure below is a storage leak, not
          // data loss.
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

  // Read-only: the caller is about to delete a row that cascades this
  // item's images rows away, and needs the paths first to clean up Storage
  // bytes afterward (images.item_id cascades, 0003_tables.sql).
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
      const flat = paths.flatMap((p) =>
        p.path_thumb ? [p.path_full, p.path_thumb] : [p.path_full],
      );
      if (flat.length) {
        const { error } = await removeImageObjects(flat);
        if (error) throw error;
      }
      setImages((prev) => {
        const next = { ...prev };
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
