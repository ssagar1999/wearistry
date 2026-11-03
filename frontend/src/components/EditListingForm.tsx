"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { categories, conditions, locations, sizes, states, type Product } from "@/lib/data";

export default function EditListingForm({ product }: { product: Product }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const f = "mt-1 w-full rounded-xl border border-line bg-white p-3 text-base";

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    const res = await api<Product>(`/products/${product.id}`, {
      method: "PATCH",
      body: {
        title: d.get("title"),
        category: d.get("category"),
        size: d.get("size"),
        condition: d.get("condition"),
        city: d.get("city"),
        price: Number(d.get("price")),
        mrp: Number(d.get("mrp")),
        story: d.get("story"),
        exchange: d.get("exchange") === "on",
      },
    });
    setBusy(false);
    if (!res.ok) return setError(res.message);
    router.push(`/product/${product.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="mt-6 space-y-4 text-sm font-medium">
      <label className="block">Title<input required minLength={2} maxLength={80} name="title" defaultValue={product.title} className={f} /></label>
      <div className="grid grid-cols-2 gap-3">
        <label>Category<select name="category" defaultValue={product.category} className={f}>{categories.map((c) => <option key={c}>{c}</option>)}</select></label>
        <label>Size<select name="size" defaultValue={product.size} className={f}>{sizes.map((c) => <option key={c}>{c}</option>)}</select></label>
        <label>Condition<select name="condition" defaultValue={product.condition} className={f}>{conditions.map((c) => <option key={c}>{c}</option>)}</select></label>
        <label>City<select name="city" defaultValue={product.city} className={f}>{states.map((x) => <optgroup key={x} label={x}>{locations[x].map((c) => <option key={c}>{c}</option>)}</optgroup>)}</select></label>
        <label>Price (₹)<input required type="number" min={1} name="price" defaultValue={product.price} className={f} /></label>
        <label>Original MRP (₹)<input required type="number" min={1} name="mrp" defaultValue={product.mrp} className={f} /></label>
      </div>
      <label className="block">Story &amp; measurements<textarea name="story" rows={4} maxLength={2000} defaultValue={product.story} className={f} /></label>
      <label className="flex items-center gap-2"><input type="checkbox" name="exchange" defaultChecked={product.exchange} /> Open to swaps</label>
      {error && <p className="text-terracotta">{error}</p>}
      <button disabled={busy} className="w-full rounded-full bg-ink py-3.5 font-semibold text-canvas disabled:opacity-50">{busy ? "Saving…" : "Save changes"}</button>
    </form>
  );
}
