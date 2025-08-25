'use client';
import { useCallback, useState } from 'react';
import imageCompression from 'browser-image-compression';
import { supabase } from '../../supabase';
import type { ImgEntry } from './types';
import { useI18n } from '../../i18n/useI18n';

export function useItemImages() {
  const { t } = useI18n();
  const [busy, setBusy] = useState<string | null>(null);
  const [deletingPath, setDeletingPath] = useState<string | null>(null);
  const [images, setImages] = useState<Record<string, ImgEntry[]>>({});

  const getItemImageEntries = useCallback(async (itemId: string) => {
    const { data: u } = await supabase.auth.getUser();
    const uid = u.user?.id;
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

    const entryData = new Map<string, { pathFull: string; pathThumb?: string }>();
    for (const [base, { full, thumb }] of pairs) {
      if (!full) continue;
      const pathFull = `${prefix}/${full.name}`;
      const pathThumb = thumb ? `${prefix}/${thumb.name}` : undefined;
      entryData.set(base, { pathFull, pathThumb });
    }

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

    const signedUrlMap = new Map(signedUrls.map((s) => [s.path, s.signedUrl]));
    const entries: ImgEntry[] = [];
    for (const data of entryData.values()) {
      const urlFull = signedUrlMap.get(data.pathFull);
      if (!urlFull) continue;
      entries.push({
        pathFull: data.pathFull,
        urlFull,
        pathThumb: data.pathThumb,
        urlThumb: data.pathThumb
          ? signedUrlMap.get(data.pathThumb)
          : undefined,
      });
    }
    return entries;
  }, []);

  const refreshItemImages = useCallback(
    async (itemId: string) => {
      const entries = await getItemImageEntries(itemId);
      if (typeof entries === 'undefined') return;
      setImages((prev) => ({ ...prev, [itemId]: entries }));
    },
    [getItemImageEntries],
  );

  const refreshAllImages = useCallback(
    async (itemIds: string[]) => {
      const results = await Promise.all(
        itemIds.map(async (itemId) => {
          const entries = await getItemImageEntries(itemId);
          return [itemId, entries] as const;
        }),
      );

      const validResults = results.filter(
        (res): res is [string, ImgEntry[]] => typeof res[1] !== 'undefined',
      );

      if (validResults.length > 0) {
        const newImages = Object.fromEntries(validResults);
        setImages((prev) => ({ ...prev, ...newImages }));
      }
    },
    [getItemImageEntries],
  );

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
        const msg = err instanceof Error ? err.message : String(err);
        alert(msg);
      } finally {
        setBusy(null);
      }
    },
    [refreshItemImages, t],
  );

  const deleteImage = useCallback(async (itemId: string, img: ImgEntry) => {
    try {
      setDeletingPath(img.pathFull);
      const paths = [img.pathFull, ...(img.pathThumb ? [img.pathThumb] : [])];
      const { error } = await supabase.storage
        .from('item-images')
        .remove(paths);
      if (error) {
        alert(error.message);
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
  }, []);

  return {
    images,
    refreshItemImages,
    refreshAllImages,
    uploadImage,
    deleteImage,
    busy,
    deletingPath,
  };
}
