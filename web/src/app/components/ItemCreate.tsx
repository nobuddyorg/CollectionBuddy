"use client";
import { useState, useCallback } from "react";
import { supabase } from "../lib/supabase";

type Props = {
  categoryId: string;
  onCreated: () => void;
};

export default function ItemCreate({ categoryId, onCreated }: Props) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const parseCoord = (v: string) => {
    const n = Number(v.trim().replace(",", "."));
    return Number.isFinite(n) ? n : null;
    // accepts "50,123" and "50.123"
  };

  const createItem = useCallback(async () => {
    const name = title.trim();
    if (!name || isCreating) return;

    const latNum = parseCoord(lat);
    const lngNum = parseCoord(lng);
    const hasCoords = latNum !== null && lngNum !== null;
    const location = hasCoords ? `SRID=4326;POINT(${lngNum} ${latNum})` : null;

    setIsCreating(true);
    try {
      const { data, error } = await supabase
        .from("items")
        .insert({
          title: name,
          description: description.trim() || null,
          location,
        })
        .select("id")
        .single<{ id: string }>();

      if (error || !data) return;

      const { error: linkError } = await supabase
        .from("item_categories")
        .insert({ item_id: data.id, category_id: categoryId });

      if (linkError) return;

      setTitle("");
      setDescription("");
      setLat("");
      setLng("");
      onCreated();
    } finally {
      setIsCreating(false);
    }
  }, [title, description, lat, lng, categoryId, isCreating, onCreated]);

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          aria-label="Titel"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && createItem()}
          placeholder="Titel"
          className="border rounded px-2 py-1 flex-1"
        />
        <input
          aria-label="Beschreibung"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && createItem()}
          placeholder="Beschreibung"
          className="border rounded px-2 py-1 flex-1"
        />
      </div>

      <div className="flex gap-2">
        <input
          aria-label="Breite (optional)"
          inputMode="decimal"
          value={lat}
          onChange={(e) => setLat(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && createItem()}
          placeholder="Breite (optional)"
          className="border rounded px-2 py-1 flex-1"
        />
        <input
          aria-label="Länge (optional)"
          inputMode="decimal"
          value={lng}
          onChange={(e) => setLng(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && createItem()}
          placeholder="Länge (optional)"
          className="border rounded px-2 py-1 flex-1"
        />
      </div>

      <button
        onClick={createItem}
        disabled={isCreating || !title.trim()}
        className="px-3 py-1 rounded bg-black text-white disabled:opacity-60"
      >
        {isCreating ? "Füge hinzu…" : "Hinzufügen"}
      </button>
    </div>
  );
}
