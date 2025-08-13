"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { Category } from "../types";

interface Props {
  selectedCat: string | null;
  onSelect: (id: string | null) => void;
}

const STRINGS = {
  selectPlaceholder: "— Kategorie wählen —",
  delete: "Löschen",
  newCategory: "Neue Kategorie",
  add: "Hinzufügen",
  confirmDelete: "Diese Kategorie wirklich löschen?",
  loadError: "Kategorien konnten nicht geladen werden.",
  createError: "Kategorie konnte nicht erstellt werden.",
  deleteError: "Kategorie konnte nicht gelöscht werden.",
};

export default function CategorySelect({ selectedCat, onSelect }: Props) {
  const [cats, setCats] = useState<Category[]>([]);
  const [name, setName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const sortedCats = useMemo(
    () =>
      [...cats].sort((a, b) =>
        a.name.localeCompare(b.name, "de", { sensitivity: "base" })
      ),
    [cats]
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
      alert(STRINGS.loadError);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCats();
  }, [loadCats]);

  const createCategory = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setIsCreating(true);
    try {
      const { data, error } = await supabase
        .from("categories")
        .insert({ name: trimmed })
        .select("id")
        .single();
      if (error) throw error;
      setName("");
      await loadCats();
      if (data?.id) onSelect(data.id);
    } catch (e) {
      console.error(e);
      alert(STRINGS.createError);
    } finally {
      setIsCreating(false);
    }
  };

  const deleteCategory = async (id: string) => {
    if (!confirm(STRINGS.confirmDelete)) return;
    setDeletingId(id);
    try {
      const { error } = await supabase.from("categories").delete().eq("id", id);
      if (error) throw error;
      if (selectedCat === id) onSelect(null);
      await loadCats();
    } catch (e) {
      console.error(e);
      alert(STRINGS.deleteError);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <select
          value={selectedCat ?? ""}
          onChange={(e) => onSelect(e.target.value || null)}
          disabled={isLoading}
          className="border rounded px-2 py-1 flex-1 bg-white dark:bg-neutral-800"
          aria-label="Kategorie wählen"
        >
          <option value="">{STRINGS.selectPlaceholder}</option>
          {sortedCats.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        {selectedCat && (
          <button
            onClick={() => deleteCategory(selectedCat)}
            disabled={!!deletingId}
            className="px-3 py-1 rounded border border-red-500 text-red-600 disabled:opacity-60"
          >
            {deletingId ? "…" : STRINGS.delete}
          </button>
        )}
      </div>

      <div className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={STRINGS.newCategory}
          className="border rounded px-2 py-1 flex-1 bg-white dark:bg-neutral-800"
        />
        <button
          onClick={createCategory}
          disabled={isCreating || !name.trim()}
          className="px-3 py-1 rounded bg-black text-white disabled:opacity-60"
        >
          {isCreating ? "…" : STRINGS.add}
        </button>
      </div>
    </div>
  );
}
