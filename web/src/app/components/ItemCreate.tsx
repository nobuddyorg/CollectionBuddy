"use client";
import { useState } from "react";
import { supabase } from "../lib/supabase";

interface Props {
  categoryId: string;
  onCreated: () => void;
}

export default function ItemCreate({ categoryId, onCreated }: Props) {
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");

  const createItem = async () => {
    if (!title.trim()) return;
    const hasCoords = lat.trim() !== "" && lng.trim() !== "";
    const location = hasCoords
      ? `SRID=4326;POINT(${Number(lng)} ${Number(lat)})`
      : null;

    const { data, error } = await supabase
      .from("items")
      .insert({
        title: title.trim(),
        description: desc.trim() || null,
        location,
      })
      .select("id")
      .single<{ id: string }>();

    if (error || !data) throw error ?? new Error("Insert returned no row");
    const itemId = data.id;

    await supabase
      .from("item_categories")
      .insert({ item_id: itemId, category_id: categoryId });

    setTitle("");
    setDesc("");
    setLat("");
    setLng("");
    onCreated();
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title"
          className="border rounded px-2 py-1 flex-1"
        />
        <input
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          placeholder="Description"
          className="border rounded px-2 py-1 flex-1"
        />
      </div>
      <div className="flex gap-2">
        <input
          value={lat}
          onChange={(e) => setLat(e.target.value)}
          placeholder="Lat (optional)"
          className="border rounded px-2 py-1 flex-1"
        />
        <input
          value={lng}
          onChange={(e) => setLng(e.target.value)}
          placeholder="Lng (optional)"
          className="border rounded px-2 py-1 flex-1"
        />
      </div>
      <button
        onClick={createItem}
        className="px-3 py-1 rounded bg-black text-white"
      >
        Add
      </button>
    </div>
  );
}
