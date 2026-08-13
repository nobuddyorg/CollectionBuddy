'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
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

export type ImageEntryData = {
  id: string;
  pathFull: string;
  pathThumb?: string;
};

// A DB row already is a full/thumb pair -- no filename-derived grouping
// needed, unlike the old storage.list()-based pairing this replaced. Groups
// a flat multi-item row set into one entry map per item, keyed by the row's
// own id, and keeps rows in the order the query returned them (oldest
// first, per item -- see listImagesForItems), which is what puts the
// grid's photographs in the right order: the first shot of an item keeps
// the hero slot however many more are added (#265).
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
// keyed to the now-current signed URLs -- one item or many, the steps are
// the same: sign the unsigned paths, cache what came back, resolve every
// path against the cache. Used to be written out twice, once per caller
// below, and had quietly drifted apart: the single-item path gave up and
// returned nothing on a signing failure, the batch path fell back to
// whatever was already cached. This keeps the more forgiving of the two --
// showing stale-but-real photographs beats showing none.
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
  const [deletingPath, setDeletingPath] = useState<Set<string>>(new Set());
  const [images, setImages] = useState<Record<string, ImgEntry[]>>({});
  // Items whose signatures are still in flight. Distinct from "has no
  // images": both used to look like an empty array, so a card rendered with
  // no image region at all and then grew one, shoving its caption and
  // buttons down the moment the pictures arrived.
  const [loadingItems, setLoadingItems] = useState<Set<string>>(new Set());
  const imagesRef = useRef(images);
  const lastSignedAtRef = useRef(0);

  useEffect(() => {
    imagesRef.current = images;
  }, [images]);

  // Always re-queries: this runs right after an upload, so the answer this
  // item's row just changed is exactly the thing that just went stale.
  //
  // Hands the entries back rather than storing them, so a caller that has
  // other state to settle at the same moment -- an upload, which owes the
  // grid a placeholder until the picture takes over -- can apply both in one
  // go instead of letting the card render in between.
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

  // One query for the whole page, replacing what used to be one
  // storage.list() call per item -- up to nine separate Storage round trips
  // gating the first photograph on screen even though most of them landed
  // well before the slowest one (#329). A single indexed query for every
  // item on the page removes that wait outright rather than just
  // pipelining around it, so there is no per-item progressive reveal left
  // to preserve here.
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

  // Refresh signed URLs before Supabase's 1h expiry so a long-lived tab
  // doesn't turn every thumbnail into a broken-image placeholder.
  useEffect(() => {
    const EXPIRY_MS = 3600_000;
    const REFRESH_MARGIN_MS = 5 * 60_000;
    const maybeRefresh = () => {
      if (!lastSignedAtRef.current) return;
      if (Date.now() - lastSignedAtRef.current < EXPIRY_MS - REFRESH_MARGIN_MS)
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
  }, [refreshAllImages]);

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
          initialQuality: 0.8,
          fileType: 'image/webp',
          useWebWorker: true,
        });
        // Derive the thumbnail from the already-downscaled 1000px image
        // rather than the original file -- a 12MP phone JPEG decoded and
        // canvas-resized twice is roughly 2x the wall time and peak memory
        // for no visible quality difference.
        //
        // 600px, not 400: this now serves two slots, not one. The
        // contact-strip cells are about a quarter of the card (~100px CSS,
        // 200-300 physical pixels on a 2-3x display), but a two-up pair's
        // half is ~178px CSS -- up to 534 physical pixels at 3x (#289). 600
        // covers that with headroom for a few more KB, rather than leaving
        // a 3x pair slightly soft.
        const thumbFile = await imageCompression(fullFile, {
          maxWidthOrHeight: 600,
          initialQuality: 0.8,
          fileType: 'image/webp',
          useWebWorker: true,
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

        // Held until the row has come back: the placeholder is meant to
        // stand in for the photograph until the photograph itself is there
        // to replace it, not until the bytes have merely been accepted.
        //
        // Stored here rather than inside the fetch so that this and the
        // release in `finally` land in the same synchronous run and React
        // batches them into one render. Two renders would put the photograph
        // on the wall with its own placeholder still standing beside it, for
        // a frame, and then take a slot back.
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

  // The row before the bytes: deleting the images row first, then the
  // Storage objects it named, means a failure in the first step still means
  // "nothing happened" -- same reasoning as removeItem (useItemMutations.tsx)
  // and deleteCategory (useCategories.tsx) applying it to a whole item's
  // photographs. Here it is one row, deleted by its own id rather than
  // captured ahead of some other row's cascade, since nothing else is
  // racing to take it away first.
  const deleteImage = useCallback(
    async (itemId: string, img: ImgEntry) => {
      if (!(await confirm(t('item_list.confirm_delete_image')))) return;
      try {
        setDeletingPath((prev) => new Set(prev).add(img.pathFull));
        const { data, error } = await deleteImageRow(img.id);
        if (error) {
          toast.reportError(
            'delete image',
            error,
            t('item_list.delete_image_error'),
          );
          return;
        }

        setImages((prev) => ({
          ...prev,
          [itemId]: (prev[itemId] || []).filter((e) => e.id !== img.id),
        }));
        toast.success(t('item_list.delete_image_success'));

        // The row is already gone at this point, irreversibly. A failure
        // here is a storage leak, not data loss -- the photograph is
        // already off the wall, and nothing is gained by leaving it there
        // to match bytes that outlived the row naming them.
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
      } finally {
        setDeletingPath((prev) => {
          const next = new Set(prev);
          next.delete(img.pathFull);
          return next;
        });
      }
    },
    [confirm, t, toast],
  );

  // Read-only capture, not a delete: the caller (removeItem/deleteCategory)
  // is about to delete a row that will cascade this item's images rows
  // away, and needs the paths beforehand to clean up the Storage bytes
  // afterward. See 0013_images.sql's note on the FK-cascade-timing design.
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
    deletingPath,
  };
}
// Stryker restore all
/* v8 ignore stop */
