import ThreadFeed from "@/components/ThreadFeed";
import { inr } from "@/lib/data";
import { listProducts } from "@/lib/repo";
import { currentUser } from "@/lib/session";
import { listThreads } from "@/lib/threads";

export const dynamic = "force-dynamic";

export default async function Threads() {
  const user = await currentUser();
  const [threads, products] = await Promise.all([listThreads(user?.id), listProducts()]);
  const minis = Object.fromEntries(products.map((p) => [p.id, { title: p.title, price: inr(p.price), image: p.image }]));
  return (
    <div className="mx-auto max-w-xl py-6">
      <h1 className="font-serif text-[28px] md:text-4xl">Threads</h1>
      <p className="mb-4 mt-1 text-sm text-umber">Show your finds, ask for what you’re hunting, offer swaps.</p>
      <ThreadFeed initial={threads} minis={minis} viewer={user?.name ? { name: user.name } : null} />
    </div>
  );
}
