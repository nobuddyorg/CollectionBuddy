"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { Category } from "../types";
import { useI18n } from "../hooks/useI18n";

interface Props {
  selectedCat: string | null;
  onSelect: (id: string | null) => void;
}

export default function CategorySelect({ selectedCat, onSelect }: Props) {
  const { t } = useI18n();
  const [cats, setCats] = useState<Category[]>([]);
  const [name, setName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [expanded, setExpanded] = useState(!selectedCat);

  useEffect(() => {
    setExpanded(!selectedCat);
  }, [selectedCat]);

  const sortedCats = useMemo(
    () =>
      [...cats].sort((a, b) =>
        a.name.localeCompare(b.name, "de", { sensitivity: "base" })
      ),
    [cats]
  );

  const selected = useMemo(
    () => (selectedCat ? cats.find((c) => c.id === selectedCat) ?? null : null),
    [cats, selectedCat]
  );

  const loadCats = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("categories")
        .select("id,name");
      if (error) throw error;
      setCats((data as Category[]) ?? []);
    } catch (e) {
      console.error(e);
      alert(t("category_select.loadError"));
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadCats();
  }, [loadCats]);

  const createCategory = async () => {
    const trimmed = name.trim();
    if (!trimmed || isCreating) return;
    setIsCreating(true);
    try {
      const { data, error } = await supabase
        .from("categories")
        .insert({ name: trimmed })
        .select("id,name")
        .single();
      if (error) throw error;
      setName("");
      await loadCats();
      if (data?.id) {
        onSelect(data.id);
        setExpanded(false);
      }
    } catch (e) {
      console.error(e);
      alert(t("category_select.createError"));
    } finally {
      setIsCreating(false);
    }
  };

  const deleteSelected = async () => {
    if (!selectedCat || isDeleting) return;
    if (!confirm(t("category_select.confirmDelete"))) return;
    setIsDeleting(true);
    try {
      const { error } = await supabase
        .from("categories")
        .delete()
        .eq("id", selectedCat);
      if (error) throw error;
      onSelect(null);
      await loadCats();
      setExpanded(true);
    } catch (e) {
      console.error(e);
      alert(t("category_select.deleteError"));
    } finally {
      setIsDeleting(false);
    }
  };

  if (!expanded && selected) {
    return (
      <section className="rounded-2xl border bg-white/70 dark:bg-neutral-900/60 backdrop-blur shadow-sm p-4 sm:p-5 flex items-center justify-between">
        <div className="truncate">
          <h2 className="text-base font-semibold mb-1">
            {t("category_select.title")}
          </h2>
          <div className="font-medium truncate">{selected.name}</div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={deleteSelected}
            disabled={isDeleting}
            className="rounded-full w-9 h-9 flex items-center justify-center border text-red-600 border-red-500/40 bg-white/60 dark:bg-neutral-800/70 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-60"
            aria-label={t("category_select.delete")}
            title={t("category_select.delete")}
          >

            <svg viewBox="0 0 24 24" className="w-5 h-5" aria-hidden="true">
              <path
                d="M3 6h18"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
              <path
                d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
              <path
                d="M6 6l1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14"
                stroke="currentColor"
                strokeWidth="2"
                fill="none"
              />
              <path
                d="M10 11v6M14 11v6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
          <button
            onClick={() => setExpanded(true)}
            className="rounded-full w-9 h-9 flex items-center justify-center border bg-white/60 dark:bg-neutral-800/70 hover:bg-neutral-100 dark:hover:bg-neutral-700"
            aria-label={t("category_select.open_category")}
            title={t("category_select.open_category")}
          >
            +
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border bg-white/70 dark:bg-neutral-900/60 backdrop-blur shadow-sm p-4 sm:p-5 space-y-3">
      <h2 className="text-base font-semibold">
        {t("category_select.title")}
      </h2>

      <div className="relative">
        <select
          value={selectedCat ?? ""}
          onChange={(e) => {
            const v = e.target.value || null;
            onSelect(v);
            if (v) setExpanded(false);
          }}
          disabled={isLoading}
          className="w-full appearance-none rounded-xl border px-3 py-2 pr-10 bg-white/60 dark:bg-neutral-800/70 outline-none ring-0 focus:border-neutral-400 dark:focus:border-neutral-600 transition"
          aria-label={t("category_select.select_placeholder")}
        >
          <option value="">{t("category_select.select_placeholder")}</option>
          {sortedCats.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm opacity-70">
          ▾
        </span>
      </div>

      <div className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("category_select.new_category")}
          onKeyDown={(e) => {
            if (e.key === "Enter") createCategory();
            if (e.key === "Escape") setExpanded(false);
          }}
          className="flex-1 rounded-xl border px-3 py-2 bg-white/60 dark:bg-neutral-800/70 outline-none focus:border-neutral-400 dark:focus:border-neutral-600"
        />
        <button
          onClick={createCategory}
          disabled={isCreating || !name.trim()}
          className="rounded-xl px-4 py-2 bg-black text-white hover:brightness-110 active:scale-[0.99] disabled:opacity-60"
        >
          {isCreating ? "…" : t("category_select.add")}
        </button>
      </div>

      {selectedCat && (
        <div className="pt-1">
          <button
            onClick={deleteSelected}
            disabled={isDeleting}
            className="rounded-xl border px-3 py-2 text-red-600 border-red-500/40 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-60"
          >
            {isDeleting ? "…" : t("category_select.delete")}
          </button>
        </div>
      )}
    </section>
  );
}
