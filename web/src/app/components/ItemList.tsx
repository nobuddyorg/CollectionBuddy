"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import Image from "next/image";
import { supabase } from "../lib/supabase";
import { Item } from "../types";

type Props = {
  categoryId: string;
};

type ItemRow = {
  id: string;
  title: string;
  description: string | null;
  item_categories: { category_id: string }[];
};

const PAGE_SIZE = 5;

export default function ItemList({ categoryId }: Props) {
  const [items, setItems] = useState<Item[]>([]);
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
      .select("id,title,description,item_categories!inner(category_id)", {
        count: "exact",
      })
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
      <ul className="space-y-3">
        {items.map((it) => (
          <li key={it.id} className="border rounded p-3 space-y-3">
            <div className="flex justify-between items-center">
              <div className="font-medium">{it.title}</div>
              <button
                onClick={() => deleteItem(it.id)}
                className="px-2 py-1 rounded border border-red-500 text-red-500"
              >
                Löschen
              </button>
            </div>

            {it.description && (
              <div className="text-sm opacity-80">{it.description}</div>
            )}

            <div className="flex gap-3 items-center">
              <input
                type="file"
                accept="image/*"
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
              {busy === it.id && <span className="text-sm">Lade hoch…</span>}
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
                    className="h-20 w-full object-cover rounded"
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
        <div className="flex gap-2 items-center">
          <button
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
            className="px-2 py-1 rounded border disabled:opacity-50"
          >
            Zurück
          </button>
          <span className="text-sm">
            Seite {page} / {totalPages}
          </span>
          <button
            disabled={page === totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="px-2 py-1 rounded border disabled:opacity-50"
          >
            Weiter
          </button>
        </div>
      )}
    </div>
  );
}
