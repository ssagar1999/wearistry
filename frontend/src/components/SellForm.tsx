"use client";
import { useCallback, useState } from "react";
import Link from "next/link";
import PhotoPicker from "./PhotoPicker";
import { api } from "@/lib/api";
import { categories, cities, conditions, locations, sizes, states, type Product } from "@/lib/data";

export default function SellForm({ defaultCity }: { defaultCity?: string }) {
  const [state, setState] = useState<{ id?: string; error?: string; busy?: boolean }>({});
  const [photos, setPhotos] = useState<{ urls: string[]; busy: boolean }>({ urls: [], busy: false });
  const onPhotos = useCallback((urls: string[], busy: boolean) => setPhotos({ urls, busy }), []);
  const f = "mt-1 w-full rounded border border-line bg-white p-2";

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    if (!photos.urls.length) return setState({ error: "Add at least one photo." });
    if (photos.busy) return setState({ error: "Wait for your photos to finish uploading." });
    setState({ busy: true });
    const res = await api<Product>("/products", {
      method: "POST",
      body: {
        title: d.get("title"),
        category: d.get("category"),
        size: d.get("size"),
        condition: d.get("condition"),
        city: d.get("city"),
        price: Number(d.get("price")),
        mrp: Number(d.get("mrp")) || undefined,
        story: d.get("story"),
        exchange: d.get("exchange") === "on",
        images: photos.urls,
      },
    });
    setState(res.ok ? { id: res.data.id } : { error: res.message });
  }

  if (state.id)
    return (
      <p className="mt-6 rounded bg-beige p-4 text-sm">
        Listed! <Link className="font-semibold underline" href={`/product/${state.id}`}>View your piece</Link>
      </p>
    );

  return (
    <form onSubmit={submit} className="mt-6 space-y-4 text-sm font-medium">
      <div>
        <p className="mb-2">Photos</p>
        <PhotoPicker onChange={onPhotos} />
      </div>
      <label className="block">Title<input required minLength={2} name="title" className={f} /></label>
      <div className="grid grid-cols-2 gap-3">
        <label>Category<select name="category" className={f}>{categories.map((c) => <option key={c}>{c}</option>)}</select></label>
        <label>Size<select name="size" className={f}>{sizes.map((c) => <option key={c}>{c}</option>)}</select></label>
        <label>Condition<select name="condition" className={f}>{conditions.map((c) => <option key={c}>{c}</option>)}</select></label>
        <label>City<select name="city" defaultValue={cities.includes(defaultCity ?? "") ? defaultCity : undefined} className={f}>{states.map((x) => <optgroup key={x} label={x}>{locations[x].map((c) => <option key={c}>{c}</option>)}</optgroup>)}</select></label>
        <label>Price (₹)<input required type="number" min={1} name="price" className={f} /></label>
        <label>Original MRP (₹)<input type="number" min={1} name="mrp" className={f} /></label>
      </div>
      <label className="block">Story &amp; measurements<textarea name="story" rows={4} className={f} /></label>
      <label className="flex items-center gap-2"><input type="checkbox" name="exchange" /> Open to swaps</label>
      {state.error && <p className="text-terracotta">{state.error}</p>}
      <button disabled={state.busy || photos.busy} className="rounded bg-ink px-6 py-3 font-semibold text-canvas disabled:opacity-50">
        {state.busy ? "Publishing…" : photos.busy ? "Uploading photos…" : "Publish listing"}
      </button>
    </form>
  );
}
