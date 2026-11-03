"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Photo from "./Photo";
import { api } from "@/lib/api";
import { inr, type Product } from "@/lib/data";

const STATUS_LABEL: Record<string, string> = { active: "Live", sold: "Sold", swapped: "Swapped" };

export default function MyListings() {
  const [items, setItems] = useState<Product[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async (after?: string) => {
    setError("");
    const res = await api<Product[]>(`/products/mine?limit=20${after ? `&cursor=${encodeURIComponent(after)}` : ""}`);
    if (!res.ok) return setError(res.message);
    setItems((current) => (after ? [...(current ?? []), ...res.data] : res.data));
    setCursor(res.meta?.nextCursor ?? null);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function setStatus(p: Product, status: "active" | "sold" | "swapped") {
    setBusyId(p.id);
    setError("");
    const res = await api<Product>(`/products/${p.id}`, { method: "PATCH", body: { status } });
    setBusyId(null);
    if (!res.ok) return setError(res.message);
    setItems((current) => current?.map((x) => (x.id === p.id ? res.data : x)) ?? null);
  }

  async function remove(p: Product) {
    if (!window.confirm(`Take down “${p.title}”? It will disappear from the shop.`)) return;
    setBusyId(p.id);
    setError("");
    const res = await api(`/products/${p.id}`, { method: "DELETE" });
    setBusyId(null);
    if (!res.ok) return setError(res.message);
    setItems((current) => current?.filter((x) => x.id !== p.id) ?? null);
  }

  const small = "rounded-full border border-ink px-4 py-2 text-sm font-semibold disabled:opacity-50";

  return (
    <div>
      {error && <p className="mb-3 text-sm text-terracotta">{error}</p>}
      {items === null && !error && <p className="py-12 text-center text-umber">Loading…</p>}
      {items?.length === 0 && (
        <div className="py-12 text-center">
          <p className="text-umber">You haven’t listed anything yet.</p>
          <Link href="/sell" className="mt-4 inline-block rounded-full bg-ink px-6 py-3 text-sm font-semibold text-canvas">List a piece</Link>
        </div>
      )}
      <ul className="space-y-3">
        {items?.map((p) => (
          <li key={p.id} className="rounded-xl border border-line bg-white p-3">
            <div className="flex gap-3">
              <Link href={`/product/${p.id}`} className="h-24 w-20 shrink-0 overflow-hidden rounded bg-beige">
                <Photo src={p.image} alt={p.title} sizes="80px" />
              </Link>
              <div className="min-w-0 flex-1">
                <p className="truncate font-serif text-lg leading-tight">{p.title}</p>
                <p className="text-xs text-umber">{p.city} · Size {p.size}{p.exchange ? " · Open to swaps" : ""}</p>
                <p className="mt-1 font-semibold">{inr(p.price)}</p>
                <span className={`label-tag mt-1 inline-block rounded-full px-2.5 py-1 ${p.status === "active" ? "bg-forest text-white" : "bg-ink/10 text-umber"}`}>
                  {STATUS_LABEL[p.status] ?? p.status}
                </span>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link href={`/listings/${p.id}/edit`} className={small}>Edit</Link>
              {p.status === "active" ? (
                <button disabled={busyId === p.id} onClick={() => setStatus(p, "sold")} className={small}>Mark sold</button>
              ) : (
                <button disabled={busyId === p.id} onClick={() => setStatus(p, "active")} className={small}>Put back on sale</button>
              )}
              <button disabled={busyId === p.id} onClick={() => remove(p)} className={`${small} border-terracotta text-terracotta`}>Remove</button>
            </div>
          </li>
        ))}
      </ul>
      {cursor && (
        <div className="mt-6 text-center">
          <button onClick={() => load(cursor)} className="rounded-full border border-ink px-6 py-3 text-sm font-semibold">Load more</button>
        </div>
      )}
    </div>
  );
}
