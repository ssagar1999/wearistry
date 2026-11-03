import { redirect } from "next/navigation";
import SwapInbox from "@/components/SwapInbox";
import { currentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function Swaps({ searchParams }: { searchParams: Promise<{ box?: string }> }) {
  const user = await currentUser();
  if (!user?.name) redirect("/login?next=/swaps");
  const { box } = await searchParams;
  return (
    <div className="mx-auto max-w-xl py-6">
      <h1 className="font-serif text-[28px] md:text-4xl">Swap requests</h1>
      <p className="mb-4 mt-1 text-sm text-umber">Offers on your pieces, and offers you’ve made. Phone numbers are shared only after a request is accepted.</p>
      <SwapInbox initialBox={box === "sent" ? "sent" : "received"} />
    </div>
  );
}
