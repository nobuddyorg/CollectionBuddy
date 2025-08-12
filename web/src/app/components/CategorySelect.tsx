"use client";
import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { Category } from "../types";

interface Props {
  selectedCat: string | null;
  onSelect: (id: string | null) => void;
}

export default function CategorySelect({ selectedCat, onSelect }: Props) {
  const [cats, setCats] = useState<Category[]>([]);
  const [catName, setCatName] = useState("");

  useEffect(() => {
    loadCats();
  }, []);

  const loadCats = async () => {
    const { data, error } = await supabase
      .from("categories")
      .select("id,name")
      .order("name");
    if (error) throw error;
    setCats(data as Category[] || []);
  };

  const createCategory = async () => {
    if (!catName.trim()) return;
    const { data, error } = await supabase
      .from("categories")
      .insert({ name: catName.trim() })
      .select("id")
      .single();
    if (error) throw error;
    setCatName("");
    await loadCats();
    if (data) onSelect(data.id);
  };

  const deleteCategory = async (id: string) => {
    if (!confirm("Delete this category?")) return;
    await supabase.from("categories").delete().eq("id", id);
    onSelect(null);
    await loadCats();
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2 items-center">
        <select
          value={selectedCat || ""}
          onChange={(e) => onSelect(e.target.value || null)}
          className="border rounded px-2 py-1 flex-1"
        >
          <option value="">-- Select category --</option>
          {cats.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        {selectedCat && (
          <button
            onClick={() => deleteCategory(selectedCat)}
            className="px-3 py-1 rounded border border-red-500 text-red-500"
          >
            Delete
          </button>
        )}
      </div>
      <div className="flex gap-2">
        <input
          value={catName}
          onChange={(e) => setCatName(e.target.value)}
          placeholder="New category"
          className="border rounded px-2 py-1 flex-1"
        />
        <button
          onClick={createCategory}
          className="px-3 py-1 rounded bg-black text-white"
        >
          Add
        </button>
      </div>
    </div>
  );
}
