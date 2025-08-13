"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import Image from "next/image";
import { supabase } from "../lib/supabase";
import { Item } from "../types";

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
      .from("items")
      .select(
        "id,title,description,place,tags,item_categories!inner(category_id)",
        { count: "exact" }
      )
      .eq("item_categories.category_id", categoryId)
      .order("created_at", { ascending: false })
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
      }))
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
      .from("item-images")
      .list(prefix, {
        limit: 12,
        sortBy: { column: "created_at", order: "desc" },
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
          .from("item-images")
          .createSignedUrl(p, 3600);
        if (se) return "";
        return s?.signedUrl || "";
      })
    );

    setImages((prev) => ({ ...prev, [itemId]: signed.filter(Boolean) }));
  }, []);

  const refreshAllImages = useCallback(
    async (itemIds: string[]) => {
      await Promise.all(itemIds.map((id) => refreshItemImages(id)));
    },
    [refreshItemImages]
  );

  useEffect(() => {
    if (!items.length || !userId) return;
    void refreshAllImages(items.map((i) => i.id));
  }, [items, userId, refreshAllImages]);

  const deleteItem = useCallback(
    async (id: string) => {
      if (!confirm("Diesen Gegenstand löschen?")) return;
      await supabase.from("items").delete().eq("id", id);
      await loadItems();
    },
    [loadItems]
  );

  const uploadImage = useCallback(
    async (itemId: string, file: File) => {
      try {
        setBusy(itemId);
        const { data: u } = await supabase.auth.getUser();
        const uid = u.user?.id;
        if (!uid) throw new Error("Keine Benutzersitzung");
        const path = `${uid}/${itemId}/${crypto.randomUUID()}-${file.name}`;
        const { error: upErr } = await supabase.storage
          .from("item-images")
          .upload(path, file);
        if (upErr) throw upErr;
        await refreshItemImages(itemId);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        alert(msg);
      } finally {
        setBusy(null);
      }
    },
    [refreshItemImages]
  );

  const totalPages = useMemo(() => Math.ceil(total / PAGE_SIZE), [total]);

  return (
    <div className="space-y-4">
      <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {items.map((it) => (
          <li
            key={it.id}
            className="rounded-2xl border bg-white/70 dark:bg-neutral-900/60 backdrop-blur p-3 shadow-sm space-y-3"
          >
            <div className="flex justify-between items-center gap-3">
              <div className="font-medium truncate">{it.title}</div>
              <button
                onClick={() => deleteItem(it.id)}
                className="rounded-lg border px-2 py-1 text-red-600 border-red-500/40 hover:bg-red-50 dark:hover:bg-red-950/30"
              >
                Löschen
              </button>
            </div>

            {it.description && (
              <div className="text-sm opacity-80 line-clamp-3">
                {it.description}
              </div>
            )}

            {it.place && (
              <div className="flex items-center gap-2 text-sm opacity-80">
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
                    className="inline-flex items-center gap-1 bg-neutral-200/80 dark:bg-neutral-700/70 rounded-full px-2 py-0.5 text-xs"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}

            <div className="flex items-center gap-2">
              <label className="inline-flex cursor-pointer items-center rounded-xl border px-3 py-2 hover:bg-neutral-50 dark:hover:bg-neutral-800/60 transition">
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
                <span className="text-sm">
                  {busy === it.id ? "Lade hoch…" : "Bild hinzufügen"}
                </span>
              </label>
            </div>

            {images[it.id]?.length ? (
              <div className="grid grid-cols-4 gap-2">
                {images[it.id].map((url, idx) => (
                  <Image
                    key={idx}
                    src={url}
                    alt={`Bild ${idx + 1}`}
                    width={160}
                    height={160}
                    unoptimized
                    className="h-20 w-full object-cover rounded-xl"
                  />
                ))}
              </div>
            ) : (
              <div className="text-sm opacity-60">
                {loading ? "Lade…" : "Keine Bilder"}
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
            className="rounded-xl border px-3 py-1 disabled:opacity-50"
          >
            Zurück
          </button>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              onClick={() => setPage(n)}
              className={
                "rounded-xl border px-3 py-1 min-w-9 " +
                (n === page
                  ? "bg-black text-white"
                  : "hover:bg-neutral-50 dark:hover:bg-neutral-800/60")
              }
            >
              {n}
            </button>
          ))}
          <button
            disabled={page === totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="rounded-xl border px-3 py-1 disabled:opacity-50"
          >
            Weiter
          </button>
        </div>
      )}
    </div>
  );
}
