"use client";
import { useEffect, useState } from "react";
import ProductCard from "./ProductCard";
import { useSaved } from "./SaveButton";
import { api } from "@/lib/api";
import type { Product } from "@/lib/data";

const MAX_IDS_PER_REQUEST = 50;

/** Saved IDs live in this browser; the listings themselves are fetched in one request by ID. */
export default function SavedList() {
  const { saved } = useSaved();
  const [items, setItems] = useState<Product[] | null>(null);
  const [error, setError] = useState("");
  const ids = saved.slice(-MAX_IDS_PER_REQUEST).reverse(); // most recently saved first

  useEffect(() => {
    if (!ids.length) return setItems([]);
    let cancelled = false;
    api<Product[]>(`/products?ids=${ids.map(encodeURIComponent).join(",")}`).then((res) => {
      if (cancelled) return;
      if (res.ok) setItems(res.data);
      else setError(res.message);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refetch only when the saved set changes
  }, [ids.join(",")]);

  if (error) return <p className="py-20 text-center text-terracotta">{error}</p>;
  if (items === null) return <p className="py-20 text-center text-umber">Loading your saved pieces…</p>;
  if (!items.length) return <p className="py-20 text-center text-umber">Tap ♡ on any piece to save it here.</p>;
  return (
    <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4 md:gap-6">
      {items.map((p) => <ProductCard key={p.id} p={p} />)}
    </div>
  );
}
