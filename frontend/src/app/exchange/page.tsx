import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import Photo from "@/components/Photo";
import SwapForm from "@/components/SwapForm";
import { inr, type Product } from "@/lib/data";
import { ApiNotFoundError, apiGet } from "@/lib/server-api";
import { currentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function Exchange({ searchParams }: { searchParams: Promise<{ item?: string }> }) {
  const { item } = await searchParams;
  if (!item || !/^[a-z0-9-]{1,120}$/.test(item)) redirect("/explore?swap=1");

  const user = await currentUser();
  if (!user?.name) redirect(`/login?next=${encodeURIComponent(`/exchange?item=${item}`)}`);
  if (!user.phone) redirect(`/login?verify=phone&next=${encodeURIComponent(`/exchange?item=${item}`)}`);

  let product: Product;
  try {
    product = (await apiGet<{ data: Product }>(`/products/${item}`)).data;
  } catch (error) {
    if (error instanceof ApiNotFoundError) notFound();
    throw error;
  }

  const blocked =
    product.status !== "active" ? "This piece is no longer available."
    : !product.exchange ? "The seller hasn’t opened this piece to swaps."
    : product.sellerId === user.id ? "This is your own listing."
    : !product.sellerId ? "This seller can’t receive swap requests yet."
    : null;

  return (
    <div className="max-w-xl py-8">
      <h1 className="font-serif text-[28px] md:text-4xl">Propose a swap</h1>
      <p className="mt-2 text-umber">Offer one of your pieces for this one. Both sides ship within India.</p>
      <Link href={`/product/${product.id}`} className="mt-5 flex items-center gap-4 rounded-xl border border-line bg-white p-3">
        <div className="h-24 w-20 shrink-0 overflow-hidden rounded bg-beige">
          <Photo src={product.image} alt={product.title} sizes="80px" />
        </div>
        <div>
          <p className="font-serif text-lg leading-tight">{product.title}</p>
          <p className="text-xs text-umber">{product.seller} · {product.city} · Size {product.size}</p>
          <p className="mt-1 font-semibold">{inr(product.price)}</p>
        </div>
      </Link>
      {blocked ? (
        <p className="mt-6 rounded-xl bg-beige p-4 text-sm">{blocked}</p>
      ) : (
        <SwapForm productId={product.id} productTitle={product.title} />
      )}
    </div>
  );
}
