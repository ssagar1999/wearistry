import { redirect } from "next/navigation";
import SellForm from "@/components/SellForm";
import { currentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function Sell() {
  const user = await currentUser();
  if (!user?.name) redirect("/login?next=/sell");
  // Sellers need a verified phone so buyers can trust and reach them.
  if (!user.phone) redirect("/login?verify=phone&next=/sell");
  return (
    <div className="max-w-xl py-8">
      <h1 className="font-serif text-[28px] md:text-4xl">List a piece</h1>
      <p className="mt-2 text-umber">Prices in ₹. Shipping within India only.</p>
      <SellForm defaultCity={user.city} />
    </div>
  );
}
