'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import Image from 'next/image';
import { supabase } from '../lib/supabase';
import { Item } from '../types';
import { useI18n } from '../hooks/useI18n';
import imageCompression from 'browser-image-compression';
import { createPortal } from 'react-dom';

type PropsList = { categoryId: string };

type ItemRow = {
  id: string;
  title: string;
  description: string | null;
  place: string | null;
  tags: string[] | null;
  item_categories: { category_id: string }[];
};

const PAGE_SIZE = 6;

export default function ItemList({ categoryId }: PropsList) {
  const [items, setItems] = useState<
    (Item & { place?: string | null; tags?: string[] | null })[]
  >([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [userId, setUserId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [images, setImages] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(false);
  const { t } = useI18n();
  const [modalImage, setModalImage] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth
      .getUser()
      .then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  useEffect(() => {
    setPage(1);
  }, [categoryId]);

  const loadItems = useCallback(async () => {
    setLoading(true);
    const from = (page - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    const { data, error, count } = await supabase
      .from('items')
      .select(
        'id,title,description,place,tags,item_categories!inner(category_id)',
        { count: 'exact' },
      )
      .eq('item_categories.category_id', categoryId)
      .order('created_at', { ascending: false })
      .range(from, to)
      .returns<ItemRow[]>();

    setLoading(false);
    if (error) return;

    setItems(
      (data ?? []).map((d) => ({
        id: d.id,
        title: d.title,
        description: d.description,
        place: d.place ?? null,
        tags: d.tags ?? [],
      })),
    );
    setTotal(count || 0);
  }, [categoryId, page]);

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  const refreshItemImages = useCallback(async (itemId: string) => {
    const { data: u } = await supabase.auth.getUser();
    const uid = u.user?.id;
    if (!uid) return;

    const prefix = `${uid}/${itemId}`;
    const { data, error } = await supabase.storage
      .from('item-images')
      .list(prefix, {
        limit: 12,
        sortBy: { column: 'created_at', order: 'desc' },
      });

    if (error) return;

    if (!data?.length) {
      setImages((prev) => ({ ...prev, [itemId]: [] }));
      return;
    }

    const paths = data.map((o) => `${prefix}/${o.name}`);
    const signed = await Promise.all(
      paths.map(async (p) => {
        const { data: s, error: se } = await supabase.storage
          .from('item-images')
          .createSignedUrl(p, 3600);
        if (se) return '';
        return s?.signedUrl || '';
      }),
    );

    setImages((prev) => ({ ...prev, [itemId]: signed.filter(Boolean) }));
  }, []);

  const refreshAllImages = useCallback(
    async (itemIds: string[]) => {
      await Promise.all(itemIds.map((id) => refreshItemImages(id)));
    },
    [refreshItemImages],
  );

  useEffect(() => {
    if (!items.length || !userId) return;
    void refreshAllImages(items.map((i) => i.id));
  }, [items, userId, refreshAllImages]);

  const deleteItem = useCallback(
    async (id: string) => {
      if (!confirm(t('item_list.confirm_delete'))) return;
      await supabase.from('items').delete().eq('id', id);
      await loadItems();
    },
    [loadItems, t],
  );

  const uploadImage = useCallback(
    async (itemId: string, file: File) => {
      try {
        setBusy(itemId);

        const { data: u } = await supabase.auth.getUser();
        const uid = u.user?.id;
        if (!uid) throw new Error(t('item_list.no_user_session'));

        const compressedFile = await imageCompression(file, {
          maxWidthOrHeight: 500,
          initialQuality: 0.8,
          fileType: 'image/webp',
          useWebWorker: true,
        });

        const path = `${uid}/${itemId}/${crypto.randomUUID()}-${compressedFile.name}`;
        const { error: upErr } = await supabase.storage
          .from('item-images')
          .upload(path, compressedFile);

        if (upErr) throw upErr;
        await refreshItemImages(itemId);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        alert(msg);
      } finally {
        setBusy(null);
      }
    },
    [refreshItemImages, t],
  );

  const totalPages = useMemo(() => Math.ceil(total / PAGE_SIZE), [total]);

  return (
    <div className="space-y-4">
      <ul className="grid sm:grid-cols-2 lg:grid-cols-2 gap-3">
        {items.map((it) => (
          <li
            key={it.id}
            className="rounded-2xl border bg-card/70 dark:bg-card/60 bg-neutral-100/50 dark:bg-neutral-800/50 backdrop-blur p-3 shadow-sm space-y-3"
          >
            <div className="flex justify-between items-center gap-3">
              <div className="font-medium truncate">{it.title}</div>
              <button
                onClick={() => deleteItem(it.id)}
                className="w-8 h-8 rounded-full bg-destructive text-destructive-foreground hover:brightness-110 flex items-center justify-center"
                title={t('item_list.delete')}
              >
                <svg
                  viewBox="0 0 24 24"
                  className="w-5 h-5"
                  aria-hidden="true"
                  stroke="currentColor"
                  strokeWidth="2"
                  fill="none"
                  strokeLinecap="round"
                >
                  <path d="M3 6h18" />
                  <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  <path d="M6 6l1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14" />
                  <path d="M10 11v6M14 11v6" />
                </svg>
              </button>
            </div>

            {it.description && (
              <div className="text-sm text-muted-foreground line-clamp-3">
                {it.description}
              </div>
            )}

            {it.place && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <svg
                  viewBox="0 0 24 24"
                  className="w-4 h-4 shrink-0 opacity-80"
                  aria-hidden="true"
                >
                  <path
                    d="M12 21s-7-6.2-7-11a7 7 0 1 1 14 0c0 4.8-7 11-7 11z"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  />
                  <circle cx="12" cy="10" r="2" fill="currentColor" />
                </svg>
                <span className="truncate">{it.place}</span>
              </div>
            )}

            {Array.isArray(it.tags) && it.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {it.tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 bg-primary/10 dark:bg-primary/20 text-primary rounded-full px-2 py-0.5 text-xs"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}

            <div className="flex items-center gap-2">
              <label
                className="w-8 h-8 flex items-center justify-center rounded-full bg-primary text-primary-foreground hover:brightness-110 transition"
                title={t('item_list.add_image')}
              >
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={!userId || busy === it.id}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    setImages((prev) => ({
                      ...prev,
                      [it.id]: [URL.createObjectURL(f), ...(prev[it.id] || [])],
                    }));
                    void uploadImage(it.id, f);
                  }}
                />
                {busy === it.id ? (
                  <div className="w-4 h-4 border-2 border-primary/40 border-t-primary rounded-full animate-spin" />
                ) : (
                  <svg
                    viewBox="0 0 24 24"
                    className="w-5 h-5"
                    aria-hidden="true"
                    stroke="currentColor"
                    strokeWidth="2"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M4 4h16v16H4z" />
                    <path d="M12 8v8M8 12h8" />
                  </svg>
                )}
              </label>
            </div>

            {images[it.id]?.length ? (
              <div className="grid grid-cols-2 gap-2">
                {images[it.id].map((url, idx) => (
                  <Image
                    key={idx}
                    src={url}
                    alt={t('item_list.image_alt').replace(
                      '{idx}',
                      `${idx + 1}`,
                    )}
                    width={160}
                    height={160}
                    unoptimized
                    className="h-20 w-full object-cover rounded-xl cursor-pointer"
                    onClick={() => setModalImage(url)}
                  />
                ))}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">
                {loading ? t('item_list.loading') : t('item_list.no_images')}
              </div>
            )}
          </li>
        ))}
      </ul>

      {totalPages > 1 && (
        <div className="flex flex-wrap gap-2 items-center justify-center">
          <button
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-primary text-primary-foreground hover:brightness-110 disabled:opacity-50"
            title={t('item_list.previous')}
          >
            <svg
              viewBox="0 0 24 24"
              className="w-5 h-5"
              stroke="currentColor"
              strokeWidth="2"
              fill="none"
            >
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              onClick={() => setPage(n)}
              className={
                'w-8 h-8 flex items-center justify-center rounded-full ' +
                (n === page
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-primary/50 text-primary-foreground hover:bg-primary')
              }
            >
              {n}
            </button>
          ))}
          <button
            disabled={page === totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-primary text-primary-foreground hover:brightness-110 disabled:opacity-50"
            title={t('item_list.next')}
          >
            <svg
              viewBox="0 0 24 24"
              className="w-5 h-5"
              stroke="currentColor"
              strokeWidth="2"
              fill="none"
            >
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>
        </div>
      )}

      {modalImage &&
        createPortal(
          <div
            className="fixed inset-0 z-90 flex flex-col items-center justify-center bg-background/90 backdrop-blur"
            onClick={() => setModalImage(null)}
          >
            <Image
              src={modalImage}
              alt={t('item_list.full_size_image_alt')}
              unoptimized
              width={0}
              height={0}
              sizes="100vw"
              className="max-w-[500px] max-h-[500px] w-auto h-auto object-contain rounded-xl shadow-lg"
            />
            <button
              onClick={() => setModalImage(null)}
              className="mt-4 w-10 h-10 flex items-center justify-center rounded-full bg-card text-card-foreground hover:bg-card/80 transition"
              title={t('item_list.close_modal')}
            >
              <svg
                viewBox="0 0 24 24"
                className="w-5 h-5"
                stroke="currentColor"
                strokeWidth="2"
                fill="none"
              >
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>,
          document.body,
        )}
    </div>
  );
}
