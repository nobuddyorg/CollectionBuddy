'use client';
import { useCallback, useState } from 'react';
import imageCompression from 'browser-image-compression';
import { supabase } from '../../supabase';
import type { ImgEntry } from './types';
import { useConfirm } from '../Confirm/ConfirmProvider';
import { useToast } from '../Toast/ToastProvider';
import { useI18n } from '../../i18n/useI18n';

// Deletes every stored object (full + thumb) under an item's prefix.
// Standalone (not part of the hook) so callers that don't otherwise need
// image state -- e.g. category deletion, which must clean up any items it
// is about to orphan -- can invoke it without mounting image state.
export async function removeItemImages(itemId: string): Promise<void> {
  const { data: u } = await supabase.auth.getUser();
  const uid = u.user?.id;
  if (!uid) return;

  const prefix = `${uid}/${itemId}`;
  const { data, error } = await supabase.storage
    .from('item-images')
    .list(prefix, { limit: 100 });
  if (error) throw error;
  if (!data?.length) return;

  const paths = data.map((o) => `${prefix}/${o.name}`);
  const { error: removeError } = await supabase.storage
    .from('item-images')
    .remove(paths);
  if (removeError) throw removeError;
}

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
    else if (name.endsWith('.webp')) slot.full = { name };
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

function toImgEntries(
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

export function useItemImages() {
  const { t } = useI18n();
  const toast = useToast();
  const confirm = useConfirm();
  const [busy, setBusy] = useState<string | null>(null);
  const [deletingPath, setDeletingPath] = useState<string | null>(null);
  const [images, setImages] = useState<Record<string, ImgEntry[]>>({});

  const getItemImageEntries = useCallback(async (itemId: string) => {
    // getSession() reads the local session, no network round trip.
    const { data: sessionData } = await supabase.auth.getSession();
    const uid = sessionData.session?.user.id;
    if (!uid) return;

    const prefix = `${uid}/${itemId}`;
    const { data, error } = await supabase.storage
      .from('item-images')
      .list(prefix, {
        limit: 48,
        sortBy: { column: 'created_at', order: 'desc' },
      });

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

    const { data: signedUrls, error: signError } = await supabase.storage
      .from('item-images')
      .createSignedUrls(pathsToSign, 3600);

    if (signError) {
      console.error('Failed to create signed URLs', signError);
      return [];
    }

    const signedUrlMap = new Map(
      signedUrls
        .filter((s) => s.path)
        .map((s) => [s.path as string, s.signedUrl]),
    );
    return toImgEntries(entryData, signedUrlMap);
  }, []);

  const refreshItemImages = useCallback(
    async (itemId: string) => {
      const entries = await getItemImageEntries(itemId);
      if (typeof entries === 'undefined') return;
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
        const { data, error } = await supabase.storage
          .from('item-images')
          .list(prefix, {
            limit: 48,
            sortBy: { column: 'created_at', order: 'desc' },
          });
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
      const { data: signedUrls, error: signError } = await supabase.storage
        .from('item-images')
        .createSignedUrls(allPaths, 3600);
      if (signError) {
        console.error('Failed to create signed URLs', signError);
      } else {
        signedUrlMap = new Map(
          signedUrls
            .filter((s) => s.path)
            .map((s) => [s.path as string, s.signedUrl]),
        );
      }
    }

    const newImages: Record<string, ImgEntry[]> = {};
    for (const [itemId, entryData] of perItem) {
      newImages[itemId] = toImgEntries(entryData, signedUrlMap);
    }
    setImages((prev) => ({ ...prev, ...newImages }));
  }, []);

  const uploadImage = useCallback(
    async (itemId: string, file: File) => {
      try {
        setBusy(itemId);
        const { data: u } = await supabase.auth.getUser();
        const uid = u.user?.id;
        if (!uid) throw new Error(t('item_list.no_user_session'));

        const fullFile = await imageCompression(file, {
          maxWidthOrHeight: 1000,
          initialQuality: 0.8,
          fileType: 'image/webp',
          useWebWorker: true,
        });
        const thumbFile = await imageCompression(file, {
          maxWidthOrHeight: 250,
          initialQuality: 0.75,
          fileType: 'image/webp',
          useWebWorker: true,
        });

        const base = crypto.randomUUID();
        const pathBase = `${uid}/${itemId}/${base}`;
        const pathFull = `${pathBase}.webp`;
        const pathThumb = `${pathBase}.thumb.webp`;

        const upFull = await supabase.storage
          .from('item-images')
          .upload(pathFull, fullFile);
        if (upFull.error) throw upFull.error;

        const upThumb = await supabase.storage
          .from('item-images')
          .upload(pathThumb, thumbFile);
        if (upThumb.error) {
          console.warn('Thumbnail upload failed:', upThumb.error);
        }

        await refreshItemImages(itemId);
      } catch (err: unknown) {
        console.error('Failed to upload image:', err);
        toast.error(t('item_list.upload_error'));
      } finally {
        setBusy(null);
      }
    },
    [refreshItemImages, t, toast],
  );

  const deleteImage = useCallback(
    async (itemId: string, img: ImgEntry) => {
      if (!(await confirm(t('item_list.confirm_delete_image')))) return;
      try {
        setDeletingPath(img.pathFull);
        const paths = [img.pathFull, ...(img.pathThumb ? [img.pathThumb] : [])];
        const { error } = await supabase.storage
          .from('item-images')
          .remove(paths);
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
        setDeletingPath(null);
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
