import Link from "next/link";
import { currentUser } from "@/lib/session";

const links = [
  ["Shop", "/explore"],
  ["Threads", "/threads"],
  ["Swap", "/explore?swap=1"],
  ["Saved", "/saved"],
];

export default async function Header() {
  const user = await currentUser();
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-canvas/95">
      <div className="mx-auto flex max-w-[1380px] items-center justify-between px-4 py-3 md:py-4 md:px-8 lg:px-14">
        <Link href="/" className="font-serif text-2xl tracking-tight">
          Wearistry <span className="text-umber text-lg">कथा</span>
        </Link>
        <nav className="flex items-center gap-5 text-sm font-medium">
          {links.map(([l, h]) => (
            <Link key={h} href={h} className="hidden hover:text-terracotta md:inline">{l}</Link>
          ))}
          <Link href="/sell" className="hidden rounded-full bg-terracotta px-4 py-2 font-semibold text-white md:inline">Sell</Link>
          {user?.name ? (
            <Link href="/account" aria-label="Your account" className="flex h-9 w-9 items-center justify-center rounded-full bg-ink font-serif text-lg text-canvas">{user.name[0]}</Link>
          ) : (
            <Link href="/login" className="rounded-full border border-ink px-4 py-1.5 font-semibold">Log in</Link>
          )}
          <Link href="/explore" aria-label="Search" className="p-1 md:hidden">
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.8}><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></svg>
          </Link>
        </nav>
      </div>
    </header>
  );
}
