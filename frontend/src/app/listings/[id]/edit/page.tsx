import { notFound, redirect } from "next/navigation";
import EditListingForm from "@/components/EditListingForm";
import type { Product } from "@/lib/data";
import { ApiNotFoundError, apiGet } from "@/lib/server-api";
import { currentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function EditListing({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[a-z0-9-]{1,120}$/.test(id)) notFound();
  const user = await currentUser();
  if (!user?.name) redirect(`/login?next=${encodeURIComponent(`/listings/${id}/edit`)}`);

  let product: Product;
  try {
    product = (await apiGet<{ data: Product }>(`/products/${id}`)).data;
  } catch (error) {
    if (error instanceof ApiNotFoundError) notFound();
    throw error;
  }
  // The API enforces ownership too; this just avoids showing a form that can only fail.
  if (product.sellerId !== user.id) notFound();

  return (
    <div className="max-w-xl py-8">
      <h1 className="font-serif text-[28px] md:text-4xl">Edit listing</h1>
      <p className="mt-2 text-umber">Photos can’t be changed yet. To use different photos, remove this listing and post it again.</p>
      <EditListingForm product={product} />
    </div>
  );
}
