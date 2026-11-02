import Link from "next/link";
import { notFound } from "next/navigation";
import Gallery from "@/components/Gallery";
import { inr, type Product } from "@/lib/data";
import { ApiNotFoundError, apiGet } from "@/lib/server-api";

async function loadProduct(id: string) {
  try {
    return (await apiGet<{ data: Product }>(`/products/${encodeURIComponent(id)}`)).data;
  } catch (error) {
    if (error instanceof ApiNotFoundError) return null;
    throw error;
  }
}

export const dynamic = "force-dynamic";

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Listing IDs are lowercase slugs; anything else can't exist (and the API would reject it).
  const p = /^[a-z0-9-]{1,120}$/.test(id) ? await loadProduct(id) : null;
  if (!p) notFound();
  return (
    <div className="grid gap-8 py-8 md:grid-cols-2">
      <Gallery images={p.images} alt={p.title} />
      <div>
        <p className="label-tag text-terracotta">{[p.category, [p.city, p.state].filter(Boolean).join(", ")].join(" · ")}</p>
        <h1 className="mt-2 font-serif text-[28px] md:text-4xl">{p.title}</h1>
        <p className="mt-3 text-[22px] font-semibold">
          {inr(p.price)} {p.mrp > p.price && <span className="text-sm font-normal text-umber line-through">{inr(p.mrp)}</span>}
        </p>
        <p className="mt-4 text-umber">{p.story}</p>
        <dl className="mt-6 grid grid-cols-2 gap-3 border-y border-line py-4 text-sm">
          <div><dt className="text-umber">Size</dt><dd className="font-semibold">{p.size}</dd></div>
          <div><dt className="text-umber">Condition</dt><dd className="font-semibold">{p.condition}</dd></div>
          <div><dt className="text-umber">Ships from</dt><dd className="font-semibold">{p.city}</dd></div>
          <div><dt className="text-umber">Delivery</dt><dd className="font-semibold">3–6 days, pan-India</dd></div>
        </dl>
        <div className="mt-6 flex gap-3">
          <button className="flex-1 rounded bg-ink py-3 text-sm font-semibold text-canvas">Buy now · UPI / cards</button>
          {p.exchange && <Link href={`/exchange?item=${p.id}`} className="flex-1 rounded border border-forest py-3 text-center text-sm font-semibold text-forest">Propose a swap</Link>}
        </div>
        <p className="mt-6 text-sm text-umber">Sold by <Link href={p.sellerSlug ? `/seller/${p.sellerSlug}` : "#"} className="font-semibold text-ink underline">{p.seller}</Link> · {p.city}</p>
      </div>
    </div>
  );
}
