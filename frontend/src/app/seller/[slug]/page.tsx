import { notFound } from "next/navigation";
import ProductCard from "@/components/ProductCard";
import { getSeller, type Page, type Product } from "@/lib/data";
import { apiGet } from "@/lib/server-api";

export const dynamic = "force-dynamic";

export default async function SellerPage({ params }: { params: Promise<{ slug: string }> }) {
  const s = getSeller((await params).slug);
  if (!s) notFound();
  const { data: list, meta } = await apiGet<Page<Product>>(`/products?sellerSlug=${s.slug}&limit=50`);
  return (
    <div className="py-8">
      <div className="flex items-center gap-4 border-b border-line pb-6">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-beige font-serif text-2xl">{s.name[0]}</div>
        <div>
          <h1 className="font-serif text-[28px] leading-tight md:text-4xl">{s.name}</h1>
          <p className="text-sm text-umber">{s.city}, India · {list.length}{meta.nextCursor ? "+" : ""} pieces</p>
          {s.verified && <span className="label-tag mt-1 inline-block rounded-full bg-forest px-2 py-1 text-white">Verified curator</span>}
        </div>
      </div>
      <p className="mt-4 max-w-xl text-umber">{s.bio}</p>
      <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4 md:gap-6">
        {list.map((p) => <ProductCard key={p.id} p={p} />)}
      </div>
    </div>
  );
}
