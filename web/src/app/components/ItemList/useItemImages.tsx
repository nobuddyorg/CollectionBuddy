'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { currentUserId, verifiedUserId } from '../../data/auth';
import {
  createSignedUrls,
  imagePrefix,
  listAllImageObjects,
  listItemImages,
  removeImageObjects,
  removeItemImages,
  uploadImageObject,
} from '../../data/images';
import type { ImgEntry } from './types';
import { useConfirm } from '../Confirm/ConfirmProvider';
import { useToast } from '../Toast/ToastProvider';
import { useI18n } from '../../i18n/useI18n';
import {
  cacheListing,
  cacheSignedUrls,
  getCachedListing,
  getCachedSignedUrl,
  invalidateListing,
  unsignedPaths,
} from './imageCache';

export type StorageObjectRow = { name: string };
export type ImageEntryData = { pathFull: string; pathThumb?: string };

// Groups a flat listing of `<base>.webp` / `<base>.thumb.webp` objects into
// full+thumb pairs, keyed by base name, with paths prefixed for signing.
//
// Listing order is carried through to the returned map, and from there to the
// order the grid hangs its photographs in, so it is load-bearing rather than
// incidental -- see IMAGE_LIST_SORT for what that order has to be and why.
export function pairImageEntries(
  data: StorageObjectRow[],
  prefix: string,
): Map<string, ImageEntryData> {
  const pairs = new Map<
    string,
    { full?: { name: string }; thumb?: { name: string } }
  >();
  for (const o of data) {
    const name = o.name;
    const base = name.endsWith('.thumb.webp')
      ? name.replace(/\.thumb\.webp$/, '')
      : name.replace(/\.webp$/, '');
    const slot = pairs.get(base) ?? {};
    if (name.endsWith('.thumb.webp')) slot.thumb = { name };
    else slot.full = { name };
    pairs.set(base, slot);
  }

  const entryData = new Map<string, ImageEntryData>();
  for (const [base, { full, thumb }] of pairs) {
    if (!full) continue;
    entryData.set(base, {
      pathFull: `${prefix}/${full.name}`,
      pathThumb: thumb ? `${prefix}/${thumb.name}` : undefined,
    });
  }
  return entryData;
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
 * pairImageEntries/toImgEntries/signEntries above are what's gated and
 * mutation-tested. */
// Stryker disable all: hook internals aren't covered by tests, only
// pairImageEntries/toImgEntries/signEntries above are -- mutants in here
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
  // Items whose listing/signatures are still in flight. Distinct from "has
  // no images": both used to look like an empty array, so a card rendered
  // with no image region at all and then grew one, shoving its caption and
  // buttons down the moment the pictures arrived.
  const [loadingItems, setLoadingItems] = useState<Set<string>>(new Set());
  const imagesRef = useRef(images);
  const lastSignedAtRef = useRef(0);

  useEffect(() => {
    imagesRef.current = images;
  }, [images]);

  const getItemImageEntries = useCallback(async (itemId: string) => {
    const listing = await listItemImages(itemId);
    if (!listing) return;
    const { prefix, data, error } = listing;

    if (error) {
      console.error('Failed to list images', error);
      return [];
    }
    if (!data?.length) {
      return [];
    }

    const entryData = pairImageEntries(data, prefix);
    cacheListing(prefix, entryData);
    if (entryData.size === 0) return [];

    const signed = await signEntries([[itemId, entryData]]);
    return signed[itemId] ?? [];
  }, []);

  // Always re-lists: this runs right after an upload, so the cached listing
  // for that item is exactly the thing that just went stale.
  //
  // Hands the entries back rather than storing them, so a caller that has
  // other state to settle at the same moment -- an upload, which owes the
  // grid a placeholder until the picture takes over -- can apply both in one
  // go instead of letting the card render in between.
  const fetchItemImages = useCallback(
    async (itemId: string) => {
      const uid = await currentUserId();
      if (uid) invalidateListing(imagePrefix(uid, itemId));

      const entries = await getItemImageEntries(itemId);
      if (typeof entries === 'undefined') return undefined;
      lastSignedAtRef.current = Date.now();
      return entries;
    },
    [getItemImageEntries],
  );

  const refreshAllImages = useCallback(async (itemIds: string[]) => {
    if (itemIds.length === 0) return;

    const uid = await currentUserId();
    if (!uid) return;

    // Only the items we don't already hold a fresh answer for are marked
    // as loading; a cached category switch should not flash skeletons.
    setLoadingItems((prev) => {
      const next = new Set(prev);
      for (const itemId of itemIds) {
        if (!getCachedListing(imagePrefix(uid, itemId))) next.add(itemId);
      }
      return next;
    });

    // One list() call per item is unavoidable (Supabase storage has no
    // recursive/flat listing across prefixes), but a cached listing skips
    // the call outright, and every remaining path is signed together in a
    // single createSignedUrls call.
    const perItem = await Promise.all(
      itemIds.map(async (itemId) => {
        const prefix = imagePrefix(uid, itemId);
        const cached = getCachedListing(prefix);
        if (cached) return [itemId, cached] as const;

        const { data, error } = await listAllImageObjects(prefix);
        if (error) {
          console.error('Failed to list images', error);
          return [itemId, new Map<string, ImageEntryData>()] as const;
        }
        const entryData = pairImageEntries(data ?? [], prefix);
        cacheListing(prefix, entryData);
        return [itemId, entryData] as const;
      }),
    );

    const newImages = await signEntries(perItem);
    lastSignedAtRef.current = Date.now();
    // Dropping everything outside the current set, not just merging the
    // new answers into whatever was already held: without this, paging or
    // searching within one category piled up every item id ever visited
    // (#330) -- accumulated state the hourly re-sign below then read in
    // full, request-storming storage.list() for items long off screen.
    const idSet = new Set(itemIds);
    setImages((prev) => {
      const kept = Object.fromEntries(
        Object.entries(prev).filter(([id]) => idSet.has(id)),
      );
      return { ...kept, ...newImages };
    });
    setLoadingItems((prev) => {
      const next = new Set(prev);
      for (const itemId of itemIds) next.delete(itemId);
      return next;
    });
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
        if (upThumb.error) {
          console.warn('Thumbnail upload failed:', upThumb.error);
        }

        // Held until the listing has come back: the placeholder is meant to
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
        console.error('Failed to upload image:', err);
        toast.error(t('item_list.upload_error'));
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

  const deleteImage = useCallback(
    async (itemId: string, img: ImgEntry) => {
      if (!(await confirm(t('item_list.confirm_delete_image')))) return;
      try {
        setDeletingPath((prev) => new Set(prev).add(img.pathFull));
        const paths = [img.pathFull, ...(img.pathThumb ? [img.pathThumb] : [])];
        const { error } = await removeImageObjects(paths);
        if (error) {
          console.error('Failed to delete image:', error);
          toast.error(t('item_list.delete_image_error'));
          return;
        }
        invalidateListing(img.pathFull.split('/').slice(0, 2).join('/'));
        setImages((prev) => ({
          ...prev,
          [itemId]: (prev[itemId] || []).filter(
            (e) => e.pathFull !== img.pathFull,
          ),
        }));
        toast.success(t('item_list.delete_image_success'));
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

  const deleteAllItemImages = useCallback(async (itemId: string) => {
    // The uid comes back from the removal rather than from a second auth
    // call: that was one more round trip on a path the user is waiting on.
    const uid = await removeItemImages(itemId);
    if (uid) invalidateListing(imagePrefix(uid, itemId));
    setImages((prev) => {
      const next = { ...prev };
      delete next[itemId];
      return next;
    });
  }, []);

  return {
    images,
    loadingItems,
    refreshAllImages,
    uploadImage,
    deleteImage,
    deleteAllItemImages,
    pendingUploads,
    deletingPath,
  };
}
// Stryker restore all
/* v8 ignore stop */
