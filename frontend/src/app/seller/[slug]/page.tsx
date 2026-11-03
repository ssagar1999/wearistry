import { notFound } from "next/navigation";
import ProductCard from "@/components/ProductCard";
import { getSeller, type Page, type Product, type PublicProfile } from "@/lib/data";
import { ApiNotFoundError, apiGet } from "@/lib/server-api";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

type View = { name: string; city: string; bio?: string; badge?: string; since?: string; query: string };

/** The URL part is either a curated shop's slug or a real seller's public ID. */
async function loadView(key: string): Promise<View | null> {
  const curated = getSeller(key);
  if (curated) {
    return { name: curated.name, city: curated.city, bio: curated.bio, badge: curated.verified ? "Verified curator" : undefined, query: `sellerSlug=${curated.slug}` };
  }
  if (!UUID.test(key)) return null;
  try {
    const { data } = await apiGet<{ data: PublicProfile }>(`/users/${key}`);
    return {
      name: data.name,
      city: data.city,
      badge: data.verified ? "Verified phone" : undefined,
      since: new Date(data.memberSince).toLocaleDateString("en-IN", { month: "long", year: "numeric" }),
      query: `sellerId=${data.id}`,
    };
  } catch (error) {
    if (error instanceof ApiNotFoundError) return null;
    throw error;
  }
}

export default async function SellerPage({ params }: { params: Promise<{ slug: string }> }) {
  const view = await loadView((await params).slug);
  if (!view) notFound();
  const { data: list, meta } = await apiGet<Page<Product>>(`/products?${view.query}&limit=50`);
  return (
    <div className="py-8">
      <div className="flex items-center gap-4 border-b border-line pb-6">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-beige font-serif text-2xl">{view.name[0]}</div>
        <div>
          <h1 className="font-serif text-[28px] leading-tight md:text-4xl">{view.name}</h1>
          <p className="text-sm text-umber">
            {[view.city && `${view.city}, India`, view.since && `Member since ${view.since}`, `${list.length}${meta.nextCursor ? "+" : ""} ${list.length === 1 && !meta.nextCursor ? "piece" : "pieces"}`].filter(Boolean).join(" · ")}
          </p>
          {view.badge && <span className="label-tag mt-1 inline-block rounded-full bg-forest px-2 py-1 text-white">{view.badge}</span>}
        </div>
      </div>
      {view.bio && <p className="mt-4 max-w-xl text-umber">{view.bio}</p>}
      <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4 md:gap-6">
        {list.map((p) => <ProductCard key={p.id} p={p} />)}
      </div>
      {!list.length && <p className="py-16 text-center text-umber">Nothing listed right now.</p>}
    </div>
  );
}
