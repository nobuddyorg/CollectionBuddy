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
  createSignedUrls,
  deleteImageRow,
  imagePrefix,
  listImagePathsForItems,
  listImagesForItems,
  removeImageObjects,
  uploadImageObject,
  type ImageListRow,
} from '../../data/images';
import type { ImgEntry } from './types';
import { useConfirm } from '../Confirm/ConfirmProvider';
import { useToast } from '../Toast/ToastProvider';
import { useI18n } from '../../i18n/useI18n';
import {
  cacheSignedUrls,
  getCachedSignedUrl,
  unsignedPaths,
} from './imageCache';
import { WEBP_COMPRESSION_OPTIONS } from '../../lib/imageCompression';
import { restoreAt } from '../../lib/optimistic';

export type ImageEntryData = {
  id: string;
  pathFull: string;
  pathThumb?: string;
};

// Groups a flat multi-item row set into one entry map per item, keyed by
// row id, preserving query order (oldest first per item, listImagesForItems)
// -- what keeps the first photograph of an item in the hero slot as more
// are added.
export function groupImageRows(
  rows: ImageListRow[],
): Map<string, Map<string, ImageEntryData>> {
  const byItem = new Map<string, Map<string, ImageEntryData>>();
  for (const row of rows) {
    const entryData =
      byItem.get(row.item_id) ?? new Map<string, ImageEntryData>();
    entryData.set(row.id, {
      id: row.id,
      pathFull: row.path_full,
      pathThumb: row.path_thumb ?? undefined,
    });
    byItem.set(row.item_id, entryData);
  }
  return byItem;
}

export function toImgEntries(
  entryData: Map<string, ImageEntryData>,
  signedUrlMap: Map<string, string>,
): ImgEntry[] {
  const entries: ImgEntry[] = [];
  for (const data of entryData.values()) {
    const urlFull = signedUrlMap.get(data.pathFull);
    if (!urlFull) continue;
    entries.push({
      id: data.id,
      pathFull: data.pathFull,
      urlFull,
      pathThumb: data.pathThumb,
      urlThumb: data.pathThumb ? signedUrlMap.get(data.pathThumb) : undefined,
    });
  }
  return entries;
}

// Signs whatever isn't already cached, then hands back every item's entries
// keyed to the current signed URLs. On a signing failure, falls back to
// whatever was already cached rather than returning nothing -- a stale but
// real photograph beats none.
export async function signEntries(
  perItem: ReadonlyArray<readonly [string, Map<string, ImageEntryData>]>,
  // Stryker disable next-line all
  // v8 ignore next
  signUrls: typeof createSignedUrls = createSignedUrls,
): Promise<Record<string, ImgEntry[]>> {
  const allPaths = perItem.flatMap(([, entryData]) =>
    Array.from(entryData.values()).flatMap((e) =>
      e.pathThumb ? [e.pathFull, e.pathThumb] : [e.pathFull],
    ),
  );

  const toSign = unsignedPaths(allPaths);
  if (toSign.length > 0) {
    const { data: signedUrls, error: signError } = await signUrls(toSign);
    if (signError) {
      console.error('Failed to create signed URLs', signError);
    } else {
      cacheSignedUrls(
        signedUrls
          .filter((s) => s.path && s.signedUrl)
          .map((s) => [s.path as string, s.signedUrl as string] as const),
      );
    }
  }

  const signedUrlMap = new Map(
    allPaths
      .map((path) => [path, getCachedSignedUrl(path)] as const)
      .filter((pair): pair is readonly [string, string] => !!pair[1]),
  );

  const result: Record<string, ImgEntry[]> = {};
  for (const [itemId, entryData] of perItem) {
    result[itemId] = toImgEntries(entryData, signedUrlMap);
  }
  return result;
}

/* v8 ignore start -- hook internals (Supabase I/O, timers, compression);
 * groupImageRows/toImgEntries/signEntries above are what's gated and
 * mutation-tested. */
// Stryker disable all: hook internals aren't covered by tests, only
// groupImageRows/toImgEntries/signEntries above are -- mutants in here
// would only be noise.

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
      if (!lastSignedAtRef.current) return;
      if (
        Date.now() - lastSignedAtRef.current <
        SIGNED_URL_SERVER_TTL_MS - REFRESH_MARGIN_MS
      )
        return;
      const itemIds = Object.keys(imagesRef.current);
      if (itemIds.length) void refreshAllImages(itemIds);
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
    const { data, error } = await listImagesForItems([itemId]);
    if (error) {
      console.error('Failed to list images', error);
      return undefined;
    }
    const entryData = groupImageRows(data ?? []).get(itemId) ?? new Map();
    const signed = await signEntries([[itemId, entryData]]);
    lastSignedAtRef.current = Date.now();
    return signed[itemId] ?? [];
  }, []);

  // One query for the whole page rather than one Storage round trip per
  // item -- removes the wait for the slowest item to gate the first
  // photograph on screen, so there's no per-item progressive reveal here.
  const refreshAllImages = useCallback(async (itemIds: string[]) => {
    if (itemIds.length === 0) return;

    setLoadingItems((prev) => new Set([...prev, ...itemIds]));

    const { data, error } = await listImagesForItems(itemIds);
    const grouped = error
      ? new Map<string, Map<string, ImageEntryData>>()
      : groupImageRows(data ?? []);
    if (error) console.error('Failed to list images', error);

    const perItem = itemIds.map(
      (itemId) => [itemId, grouped.get(itemId) ?? new Map()] as const,
    );
    const signed = await signEntries(perItem);

    const idSet = new Set(itemIds);
    setImages((prev) => {
      const kept = Object.fromEntries(
        Object.entries(prev).filter(([id]) => !idSet.has(id)),
      );
      return { ...kept, ...signed };
    });
    setLoadingItems((prev) => {
      const next = new Set(prev);
      for (const itemId of itemIds) next.delete(itemId);
      return next;
    });
    lastSignedAtRef.current = Date.now();
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
        toast.reportError('upload image', err, t('item_list.upload_error'));
      } finally {
        setPendingUploads((prev) => {
          const remaining = (prev[itemId] ?? 1) - 1;
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
          [itemId]: restoreAt(prev[itemId] || [], index, img),
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
  // bytes afterward (0013_images.sql).
  const captureItemImagePaths = useCallback(async (itemId: string) => {
    const { data, error } = await listImagePathsForItems([itemId]);
    if (error) {
      console.error('Failed to read image paths before delete', error);
      return [];
    }
    return data ?? [];
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
    uploadImage,
    deleteImage,
    captureItemImagePaths,
    removeImageBytes,
    pendingUploads,
  };
}
// Stryker restore all
/* v8 ignore stop */
