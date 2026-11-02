import ThreadFeed from "@/components/ThreadFeed";
import type { Page, Thread } from "@/lib/data";
import { apiGet } from "@/lib/server-api";
import { currentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function Threads() {
  const [user, { data: threads, meta }] = await Promise.all([currentUser(), apiGet<Page<Thread>>("/threads?limit=20")]);
  return (
    <div className="mx-auto max-w-xl py-6">
      <h1 className="font-serif text-[28px] md:text-4xl">Threads</h1>
      <p className="mb-4 mt-1 text-sm text-umber">Show your finds, ask for what you’re hunting, offer swaps.</p>
      <ThreadFeed initial={threads} initialCursor={meta.nextCursor} viewer={user?.name ? { name: user.name } : null} />
    </div>
  );
}
