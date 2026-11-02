"use client";
import ProductCard from "./ProductCard";
import { useSaved } from "./SaveButton";
import type { Product } from "@/lib/data";

export default function SavedList({ all }: { all: Product[] }) {
  const { saved } = useSaved();
  const list = all.filter((p) => saved.includes(p.id));
  if (!list.length) return <p className="py-20 text-center text-umber">Tap ♡ on any piece to save it here.</p>;
  return (
    <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4 md:gap-6">
      {list.map((p) => <ProductCard key={p.id} p={p} />)}
    </div>
  );
}
