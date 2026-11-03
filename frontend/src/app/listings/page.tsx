import { redirect } from "next/navigation";
import MyListings from "@/components/MyListings";
import { currentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function Listings() {
  const user = await currentUser();
  if (!user?.name) redirect("/login?next=/listings");
  return (
    <div className="mx-auto max-w-xl py-6">
      <h1 className="font-serif text-[28px] md:text-4xl">My listings</h1>
      <p className="mb-4 mt-1 text-sm text-umber">Edit a price, mark a piece sold, or take it down.</p>
      <MyListings />
    </div>
  );
}
