"use client";
import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import { supabase } from "../lib/supabase";
import { Item } from "../types";

interface Props {
  categoryId: string;
}

type ItemRow = {
  id: string;
  title: string;
  description: string | null;
  item_categories: { category_id: string }[];
};

export default function ItemList({ categoryId }: Props) {
  const [items, setItems] = useState<Item[]>([]);
  const [page, setPage] = useState(1);
  const pageSize = 5;
  const [total, setTotal] = useState(0);
  const [userId, setUserId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [images, setImages] = useState<Record<string, string[]>>({});

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  const loadItems = useCallback(async () => {
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const { data, error, count } = await supabase
      .from("items")
      .select("id,title,description,item_categories!inner(category_id)", { count: "exact" })
      .eq("item_categories.category_id", categoryId)
      .order("created_at", { ascending: false })
      .range(from, to)
      .returns<ItemRow[]>();

    if (error) throw error;
    setItems((data ?? []).map(d => ({ id: d.id, title: d.title, description: d.description })));
    setTotal(count || 0);
  }, [categoryId, page]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  const refreshItemImages = useCallback(async (itemId: string) => {
    const { data: u } = await supabase.auth.getUser();
    const uid = u.user?.id;
    if (!uid) return;

    const prefix = `${uid}/${itemId}`;
    const { data, error } = await supabase.storage
      .from("item-images")
      .list(prefix, { limit: 12, sortBy: { column: "created_at", order: "desc" } });

    if (error) return;

    if (!data?.length) {
      setImages(prev => ({ ...prev, [itemId]: [] }));
      return;
    }

    const paths = data.map(o => `${prefix}/${o.name}`);
    const signed = await Promise.all(
      paths.map(async p => {
        const { data: s, error: se } = await supabase.storage.from("item-images").createSignedUrl(p, 3600);
        if (se) return "";
        return s?.signedUrl || "";
      })
    );
    setImages(prev => ({ ...prev, [itemId]: signed.filter(Boolean) }));
  }, []);

  const refreshAllImages = useCallback(async (itemIds: string[]) => {
    await Promise.all(itemIds.map(id => refreshItemImages(id)));
  }, [refreshItemImages]);

  useEffect(() => {
    if (!items.length || !userId) return;
    refreshAllImages(items.map(i => i.id));
  }, [items, userId, refreshAllImages]);

  const deleteItem = async (id: string) => {
    if (!confirm("Delete this item?")) return;
    await supabase.from("items").delete().eq("id", id).throwOnError();
    await loadItems();
  };

  const uploadImage = async (itemId: string, file: File) => {
    try {
      setBusy(itemId);

      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id;
      if (!uid) throw new Error("No user session");

      const path = `${uid}/${itemId}/${crypto.randomUUID()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from("item-images").upload(path, file);
      if (upErr) throw upErr;

      await refreshItemImages(itemId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(msg);
    } finally {
      setBusy(null);
    }
  };

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="space-y-4">
      <ul className="space-y-3">
        {items.map(it => (
          <li key={it.id} className="border rounded p-3 space-y-3">
            <div className="flex justify-between items-center">
              <div className="font-medium">{it.title}</div>
              <button
                onClick={() => deleteItem(it.id)}
                className="px-2 py-1 rounded border border-red-500 text-red-500"
              >
                Delete
              </button>
            </div>

            <div className="flex gap-3 items-center">
              <input
                type="file"
                accept="image/*"
                disabled={!userId || busy === it.id}
                onChange={e => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  setImages(prev => ({
                    ...prev,
                    [it.id]: [URL.createObjectURL(f), ...(prev[it.id] || [])],
                  }));
                  uploadImage(it.id, f);
                }}
              />
              {busy === it.id && <span className="text-sm">Uploading…</span>}
            </div>

            {images[it.id]?.length ? (
              <div className="grid grid-cols-4 gap-2">
                {images[it.id].map((url, idx) => (
                  <Image
                    key={idx}
                    src={url}
                    alt=""
                    width={160}
                    height={160}
                    unoptimized
                    className="h-20 w-full object-cover rounded"
                  />
                ))}
              </div>
            ) : (
              <div className="text-sm opacity-60">No images</div>
            )}
          </li>
        ))}
      </ul>

      {totalPages > 1 && (
        <div className="flex gap-2 items-center">
          <button
            disabled={page === 1}
            onClick={() => setPage(p => p - 1)}
            className="px-2 py-1 rounded border disabled:opacity-50"
          >
            Prev
          </button>
          <span className="text-sm">
            Page {page} / {totalPages}
          </span>
          <button
            disabled={page === totalPages}
            onClick={() => setPage(p => p + 1)}
            className="px-2 py-1 rounded border disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
