"use client";
import { useState } from "react";
import ProductCard from "./ProductCard";
import { api } from "@/lib/api";
import type { Product } from "@/lib/data";

/** Appends the next pages of a product list. `query` is the same filter string the first page used. */
export default function LoadMoreProducts({ query, cursor }: { query: string; cursor: string }) {
  const [items, setItems] = useState<Product[]>([]);
  const [next, setNext] = useState<string | null>(cursor);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    if (!next) return;
    setBusy(true);
    setError("");
    const params = new URLSearchParams(query);
    params.set("cursor", next);
    const res = await api<Product[]>(`/products?${params}`);
    setBusy(false);
    if (!res.ok) return setError(res.message);
    setItems((current) => [...current, ...res.data]);
    setNext(res.meta?.nextCursor ?? null);
  }

  return (
    <>
      {items.length > 0 && (
        <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4 md:gap-6">
          {items.map((p) => <ProductCard key={p.id} p={p} />)}
        </div>
      )}
      {error && <p className="mt-4 text-center text-sm text-terracotta">{error}</p>}
      {next && (
        <div className="mt-6 text-center">
          <button onClick={load} disabled={busy} className="rounded-full border border-ink px-6 py-3 text-sm font-semibold disabled:opacity-50">
            {busy ? "Loading…" : "Load more"}
          </button>
        </div>
      )}
    </>
  );
}
