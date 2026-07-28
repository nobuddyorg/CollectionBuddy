'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../supabase';
import {
  createSignedUrls,
  listAllImageObjects,
  removeImageObjects,
  removeItemImages,
  uploadImageObject,
} from '../../data/images';
import type { ImgEntry } from './types';
import { useConfirm } from '../Confirm/ConfirmProvider';
import { useToast } from '../Toast/ToastProvider';
import { useI18n } from '../../i18n/useI18n';

export type StorageObjectRow = { name: string };
export type ImageEntryData = { pathFull: string; pathThumb?: string };

// Groups a flat listing of `<base>.webp` / `<base>.thumb.webp` objects into
// full+thumb pairs, keyed by base name, with paths prefixed for signing.
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

/* v8 ignore start -- hook internals (Supabase I/O, timers, compression);
 * pairImageEntries/toImgEntries above are what's gated and mutation-tested. */
// Stryker disable all: hook internals aren't covered by tests, only
// pairImageEntries/toImgEntries above are -- mutants in here would only be noise.
export function useItemImages() {
  const { t } = useI18n();
  const toast = useToast();
  const confirm = useConfirm();
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [deletingPath, setDeletingPath] = useState<Set<string>>(new Set());
  const [images, setImages] = useState<Record<string, ImgEntry[]>>({});
  const imagesRef = useRef(images);
  const lastSignedAtRef = useRef(0);

  useEffect(() => {
    imagesRef.current = images;
  }, [images]);

  const getItemImageEntries = useCallback(async (itemId: string) => {
    // getSession() reads the local session, no network round trip.
    const { data: sessionData } = await supabase.auth.getSession();
    const uid = sessionData.session?.user.id;
    if (!uid) return;

    const prefix = `${uid}/${itemId}`;
    const { data, error } = await listAllImageObjects(prefix);

    if (error) {
      console.error('Failed to list images', error);
      return [];
    }
    if (!data?.length) {
      return [];
    }

    const entryData = pairImageEntries(data, prefix);
    const pathsToSign = Array.from(entryData.values()).flatMap((e) =>
      e.pathThumb ? [e.pathFull, e.pathThumb] : [e.pathFull],
    );
    if (pathsToSign.length === 0) return [];

    const { data: signedUrls, error: signError } =
      await createSignedUrls(pathsToSign);

    if (signError) {
      console.error('Failed to create signed URLs', signError);
      return [];
    }

    const signedUrlMap = new Map(
      signedUrls
        .filter((s) => s.path && s.signedUrl)
        .map((s) => [s.path as string, s.signedUrl as string]),
    );
    return toImgEntries(entryData, signedUrlMap);
  }, []);

  const refreshItemImages = useCallback(
    async (itemId: string) => {
      const entries = await getItemImageEntries(itemId);
      if (typeof entries === 'undefined') return;
      lastSignedAtRef.current = Date.now();
      setImages((prev) => ({ ...prev, [itemId]: entries }));
    },
    [getItemImageEntries],
  );

  const refreshAllImages = useCallback(async (itemIds: string[]) => {
    if (itemIds.length === 0) return;

    const { data: sessionData } = await supabase.auth.getSession();
    const uid = sessionData.session?.user.id;
    if (!uid) return;

    // One list() call per item is unavoidable (Supabase storage has no
    // recursive/flat listing across prefixes), but every item's paths are
    // signed together in a single createSignedUrls call.
    const perItem = await Promise.all(
      itemIds.map(async (itemId) => {
        const prefix = `${uid}/${itemId}`;
        const { data, error } = await listAllImageObjects(prefix);
        if (error) {
          console.error('Failed to list images', error);
          return [itemId, new Map<string, ImageEntryData>()] as const;
        }
        return [itemId, pairImageEntries(data ?? [], prefix)] as const;
      }),
    );

    const allPaths = perItem.flatMap(([, entryData]) =>
      Array.from(entryData.values()).flatMap((e) =>
        e.pathThumb ? [e.pathFull, e.pathThumb] : [e.pathFull],
      ),
    );

    let signedUrlMap = new Map<string, string>();
    if (allPaths.length > 0) {
      const { data: signedUrls, error: signError } =
        await createSignedUrls(allPaths);
      if (signError) {
        console.error('Failed to create signed URLs', signError);
      } else {
        signedUrlMap = new Map(
          signedUrls
            .filter((s) => s.path && s.signedUrl)
            .map((s) => [s.path as string, s.signedUrl as string]),
        );
      }
    }

    const newImages: Record<string, ImgEntry[]> = {};
    for (const [itemId, entryData] of perItem) {
      newImages[itemId] = toImgEntries(entryData, signedUrlMap);
    }
    lastSignedAtRef.current = Date.now();
    setImages((prev) => ({ ...prev, ...newImages }));
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
        setBusy((prev) => new Set(prev).add(itemId));
        const { data: u } = await supabase.auth.getUser();
        const uid = u.user?.id;
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
        // for no visible quality difference at 250px.
        const thumbFile = await imageCompression(fullFile, {
          maxWidthOrHeight: 250,
          initialQuality: 0.75,
          fileType: 'image/webp',
          useWebWorker: true,
        });

        const base = crypto.randomUUID();
        const pathBase = `${uid}/${itemId}/${base}`;
        const pathFull = `${pathBase}.webp`;
        const pathThumb = `${pathBase}.thumb.webp`;

        const upFull = await uploadImageObject(pathFull, fullFile);
        if (upFull.error) throw upFull.error;

        const upThumb = await uploadImageObject(pathThumb, thumbFile);
        if (upThumb.error) {
          console.warn('Thumbnail upload failed:', upThumb.error);
        }

        await refreshItemImages(itemId);
      } catch (err: unknown) {
        console.error('Failed to upload image:', err);
        toast.error(t('item_list.upload_error'));
      } finally {
        setBusy((prev) => {
          const next = new Set(prev);
          next.delete(itemId);
          return next;
        });
      }
    },
    [refreshItemImages, t, toast],
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
        setImages((prev) => ({
          ...prev,
          [itemId]: (prev[itemId] || []).filter(
            (e) => e.pathFull !== img.pathFull,
          ),
        }));
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
    await removeItemImages(itemId);
    setImages((prev) => {
      const next = { ...prev };
      delete next[itemId];
      return next;
    });
  }, []);

  return {
    images,
    refreshItemImages,
    refreshAllImages,
    uploadImage,
    deleteImage,
    deleteAllItemImages,
    busy,
    deletingPath,
  };
}
// Stryker restore all
/* v8 ignore stop */
