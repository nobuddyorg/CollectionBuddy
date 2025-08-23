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

  const refreshItemImages = useCallback(async (itemId: string) => {
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
    if (error) return;

    if (!data?.length) {
      setImages((prev) => ({ ...prev, [itemId]: [] }));
      return;
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

    const entries: ImgEntry[] = [];
    for (const [, { full, thumb }] of pairs) {
      if (!full) continue;
      const pathFull = `${prefix}/${full.name}`;
      const { data: sFull } = await supabase.storage
        .from('item-images')
        .createSignedUrl(pathFull, 3600);
      const urlFull = sFull?.signedUrl ?? '';
      let pathThumb: string | undefined;
      let urlThumb: string | undefined;
      if (thumb) {
        pathThumb = `${prefix}/${thumb.name}`;
        const { data: sThumb } = await supabase.storage
          .from('item-images')
          .createSignedUrl(pathThumb, 3600);
        urlThumb = sThumb?.signedUrl ?? undefined;
      }
      entries.push({ pathFull, urlFull, pathThumb, urlThumb });
    }

    setImages((prev) => ({ ...prev, [itemId]: entries }));
  }, []);

  const refreshAllImages = useCallback(
    async (itemIds: string[]) => {
      await Promise.all(itemIds.map(refreshItemImages));
    },
    [refreshItemImages],
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
