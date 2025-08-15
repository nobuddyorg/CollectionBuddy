'use client';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Image from 'next/image';
import { supabase } from '../lib/supabase';
import { Item } from '../types';
import { useI18n } from '../hooks/useI18n';
import imageCompression from 'browser-image-compression';
import ItemForm, { ItemFormValues } from '../components/ItemForm';
import CenteredModal from '../components/CenteredModal';
import ReactDOM from 'react-dom';

type PropsList = { categoryId: string };

type ItemRow = {
  id: string;
  title: string;
  description: string | null;
  place: string | null;
  tags: string[] | null;
  item_categories: { category_id: string }[];
};

type ImgEntry = { path: string; url: string };

const PAGE_SIZE = 6;

export default function ItemList({ categoryId }: PropsList) {
  const [items, setItems] = useState<
    (Item & { place?: string | null; tags?: string[] | null })[]
  >([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [userId, setUserId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [images, setImages] = useState<Record<string, ImgEntry[]>>({});
  const [loading, setLoading] = useState(false);
  const { t } = useI18n();
  const [modalImage, setModalImage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingPath, setDeletingPath] = useState<string | null>(null);

  // mobile-only tap-to-reveal per item
  const [actionsOpen, setActionsOpen] = useState<Record<string, boolean>>({});

  const reqSeq = useRef(0);

  // edit modal
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<null | {
    id: string;
    values: ItemFormValues;
  }>(null);

  const [q, setQ] = useState('');
  const [qDebounced, setQDebounced] = useState('');
  useEffect(() => {
    const id = setTimeout(() => setQDebounced(q.trim()), 200);
    return () => clearTimeout(id);
  }, [q]);
  useEffect(() => setPage(1), [categoryId, qDebounced]);

  useEffect(() => {
    supabase.auth
      .getUser()
      .then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  useEffect(() => setPage(1), [categoryId]);

  const loadItems = useCallback(async () => {
    const mySeq = ++reqSeq.current;
    if (mySeq === reqSeq.current) setLoading(true);

    const from = (page - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const needle = qDebounced.trim();

    let query = supabase
      .from('items')
      .select(
        'id,title,description,place,tags,item_categories!inner(category_id)',
        { count: 'exact' },
      )
      .eq('item_categories.category_id', categoryId);

    if (needle) {
      const esc = needle.replace(/[%_]/g, '\\$&');
      const like = `%${esc}%`;
      query = query.or(
        `title.ilike.${like},description.ilike.${like},place.ilike.${like},tags_text.ilike.${like}`,
      );
    }

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(from, to)
      .returns<ItemRow[]>();

    if (mySeq !== reqSeq.current) return;

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
  }, [categoryId, page, qDebounced]);

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
        limit: 24,
        sortBy: { column: 'created_at', order: 'desc' },
      });
    if (error) return;

    if (!data?.length) {
      setImages((prev) => ({ ...prev, [itemId]: [] }));
      return;
    }

    const entries: ImgEntry[] = [];
    for (const o of data) {
      const path = `${prefix}/${o.name}`;
      const { data: s } = await supabase.storage
        .from('item-images')
        .createSignedUrl(path, 3600);
      if (s?.signedUrl) entries.push({ path, url: s.signedUrl });
    }
    setImages((prev) => ({ ...prev, [itemId]: entries }));
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

  const deleteImage = useCallback(
    async (itemId: string, path: string) => {
      if (!confirm(t('item_list.confirm_delete'))) return;
      try {
        setDeletingPath(path);
        const { error } = await supabase.storage
          .from('item-images')
          .remove([path]);
        if (error) {
          alert(error.message);
          return;
        }
        setImages((prev) => ({
          ...prev,
          [itemId]: (prev[itemId] || []).filter((e) => e.path !== path),
        }));
        if (
          modalImage &&
          (images[itemId] || []).some(
            (e) => e.path === path && e.url === modalImage,
          )
        ) {
          setModalImage(null);
        }
      } finally {
        setDeletingPath(null);
      }
    },
    [t, modalImage, images],
  );

  const totalPages = useMemo(() => Math.ceil(total / PAGE_SIZE), [total]);

  const openEdit = (
    it: Item & { place?: string | null; tags?: string[] | null },
  ) => {
    setEditing({
      id: it.id,
      values: {
        title: it.title,
        description: it.description ?? '',
        place: it.place ?? '',
        tags: Array.isArray(it.tags) ? it.tags : [],
      },
    });
    setEditOpen(true);
  };

  const saveEdit = async (values: ItemFormValues) => {
    if (!editing || isSaving) return;
    setIsSaving(true);
    try {
      const payload = {
        title: values.title.trim(),
        description: values.description.trim() || null,
        place: values.place.trim() || null,
        tags: values.tags,
      };
      const { error } = await supabase
        .from('items')
        .update(payload)
        .eq('id', editing.id);
      if (error) {
        alert(error.message);
        return;
      }
      setItems((prev) =>
        prev.map((it) => (it.id === editing.id ? { ...it, ...payload } : it)),
      );
      setEditOpen(false);
      setEditing(null);
      setActionsOpen((m) => ({ ...m, [editing.id]: false }));
    } finally {
      setIsSaving(false);
    }
  };

  const toggleActions = (id: string) =>
    setActionsOpen((m) => ({ ...m, [id]: !m[id] }));
  const closeActions = (id: string) =>
    setActionsOpen((m) => ({ ...m, [id]: false }));

  return (
    <div className="space-y-4">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={t('item_list.search_placeholder')}
        className="w-full rounded-xl border bg-background px-3 py-2 shadow-sm"
      />

      <ul className="grid sm:grid-cols-2 lg:grid-cols-2 gap-3">
        {items.map((it) => {
          const isOpen = !!actionsOpen[it.id];
          return (
            <li
              key={it.id}
              className="group relative rounded-2xl border bg-card/70 dark:bg-card/60 bg-neutral-100/50 dark:bg-neutral-800/50 backdrop-blur p-3 shadow-sm space-y-3"
            >
              <div className="font-medium pr-16 truncate">{it.title}</div>

              {/* Mobile "..." opener (hidden ≥ sm) */}
              <button
                className={`absolute top-3 right-3 sm:hidden w-9 h-9 flex items-center justify-center rounded-xl bg-muted text-foreground shadow ${isOpen ? 'hidden' : ''}`}
                onClick={() => toggleActions(it.id)}
                aria-label={t('item_list.more_actions') ?? 'More actions'}
              >
                <svg
                  viewBox="0 0 24 24"
                  className="w-5 h-5"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <circle cx="5" cy="12" r="2" />
                  <circle cx="12" cy="12" r="2" />
                  <circle cx="19" cy="12" r="2" />
                </svg>
              </button>

              {/* Actions bar:
                  - < sm: toggled by isOpen (tap-to-reveal)
                  - ≥ sm: hover/focus reveal via group-hover */}
              <div
                className={[
                  'absolute top-3 right-3 flex items-center gap-2 transition-opacity',
                  isOpen
                    ? 'opacity-100 pointer-events-auto'
                    : 'opacity-0 pointer-events-none',
                  'sm:opacity-0 sm:pointer-events-none sm:group-hover:opacity-100 sm:group-hover:pointer-events-auto',
                ].join(' ')}
              >
                {/* Mobile close (hidden ≥ sm) */}
                <button
                  className="sm:hidden w-9 h-9 flex items-center justify-center rounded-xl bg-card border text-foreground shadow"
                  onClick={() => closeActions(it.id)}
                  aria-label={t('common.close') ?? 'Close'}
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="w-5 h-5"
                    stroke="currentColor"
                    strokeWidth="2"
                    fill="none"
                    aria-hidden="true"
                  >
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>

                <label
                  className="w-9 h-9 flex items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm hover:brightness-110 transition cursor-pointer"
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
                      void uploadImage(it.id, f);
                      closeActions(it.id);
                    }}
                  />
                  {busy === it.id ? (
                    <div className="w-4 h-4 border-2 border-primary-foreground/40 border-t-primary-foreground rounded-full animate-spin" />
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

                <button
                  onClick={() => {
                    openEdit(it);
                    closeActions(it.id);
                  }}
                  className="w-9 h-9 rounded-xl bg-primary text-primary-foreground shadow-sm hover:brightness-110 flex items-center justify-center"
                  title={t('item_list.edit')}
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
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
                  </svg>
                </button>

                <button
                  onClick={() => {
                    void deleteItem(it.id);
                    closeActions(it.id);
                  }}
                  className="w-9 h-9 rounded-xl bg-red-500 text-white shadow-sm hover:bg-red-600 flex items-center justify-center"
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

              {images[it.id]?.length ? (
                <div className="grid grid-cols-2 gap-2">
                  {images[it.id].map((img) => (
                    <div
                      key={img.path}
                      className="relative group"
                      onClick={() => setModalImage(img.url)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ')
                          setModalImage(img.url);
                      }}
                    >
                      <Image
                        src={img.url}
                        alt={t('item_list.image_alt').replace('{idx}', '')}
                        width={160}
                        height={160}
                        unoptimized
                        className="h-20 w-full object-cover rounded-xl cursor-pointer"
                      />
                      <button
                        title={t('item_list.delete')}
                        onClick={(e) => {
                          e.stopPropagation();
                          void deleteImage(it.id, img.path);
                        }}
                        disabled={deletingPath === img.path || busy === it.id}
                        className={[
                          // base (mobile): show when actions panel is open
                          isOpen ? 'opacity-100' : 'opacity-0',
                          // ≥ sm: hide until hover
                          'sm:opacity-0 sm:group-hover:opacity-100',
                          'absolute top-1 right-1 w-7 h-7 flex items-center justify-center rounded-lg bg-red-600 text-white shadow disabled:opacity-60 transition',
                        ].join(' ')}
                      >
                        {deletingPath === img.path ? (
                          <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                        ) : (
                          <svg
                            viewBox="0 0 24 24"
                            className="w-4 h-4"
                            stroke="currentColor"
                            strokeWidth="2"
                            fill="none"
                          >
                            <path d="M3 6h18" />
                            <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                            <path d="M6 6l1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14" />
                            <path d="M10 11v6M14 11v6" />
                          </svg>
                        )}
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">
                  {loading ? t('item_list.loading') : t('item_list.no_images')}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {totalPages > 1 && (
        <div className="flex flex-wrap gap-2 items-center justify-center">
          <button
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm hover:brightness-110 disabled:opacity-50"
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
                'min-w-9 h-9 px-2 flex items-center justify-center rounded-xl shadow-sm ' +
                (n === page
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-primary/60 text-primary-foreground hover:bg-primary')
              }
            >
              {n}
            </button>
          ))}
          <button
            disabled={page === totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm hover:brightness-110 disabled:opacity-50"
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
        typeof document !== 'undefined' &&
        ReactDOM.createPortal(
          <div
            className="fixed inset-0 z-500 flex flex-col items-center justify-center bg-background/90 backdrop-blur"
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
              className="mt-4 w-10 h-10 flex items-center justify-center rounded-xl bg-card text-card-foreground hover:bg-card/80 transition"
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

      <CenteredModal
        open={editOpen}
        onOpenChange={(v) => {
          setEditOpen(v);
          if (!v) setEditing(null);
        }}
        title={t('item_list.edit_item')}
        closeLabel="X"
      >
        <section className="relative z-50">
          <ItemForm
            key={editing?.id}
            initial={
              editing?.values ?? {
                title: '',
                description: '',
                place: '',
                tags: [],
              }
            }
            submitLabel={t('common.save')}
            submitting={isSaving}
            onSubmit={saveEdit}
            onCancel={() => {
              setEditOpen(false);
              setEditing(null);
            }}
            showIconSubmit
          />
        </section>
      </CenteredModal>
    </div>
  );
}
