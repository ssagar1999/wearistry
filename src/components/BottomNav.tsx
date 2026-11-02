"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const icon = {
  home: "M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z",
  shop: "M11 4a7 7 0 1 0 4.2 12.6L20 21.4 21.4 20l-4.8-4.8A7 7 0 0 0 11 4zm0 2a5 5 0 1 1 0 10 5 5 0 0 1 0-10z",
  threads: "M4 4h16v12H8l-4 4zm2 2v9.2L7.2 14H18V6z",
  saved: "M12 21s-7.5-4.6-9.3-9.3C1.4 8.1 3.6 4.5 7.2 4.5c2 0 3.4 1.1 4.8 2.7 1.4-1.6 2.8-2.7 4.8-2.7 3.6 0 5.8 3.6 4.5 7.2C19.5 16.4 12 21 12 21z",
};
const tabs = [
  { l: "Home", h: "/", d: icon.home },
  { l: "Shop", h: "/explore", d: icon.shop },
  { l: "Sell", h: "/sell", d: "" },
  { l: "Threads", h: "/threads", d: icon.threads },
  { l: "Saved", h: "/saved", d: icon.saved },
];

export default function BottomNav() {
  const path = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-line bg-canvas pb-[env(safe-area-inset-bottom)] md:hidden">
      {tabs.map(({ l, h, d }) => {
        const on = h === "/" ? path === "/" : path.startsWith(h);
        if (!d)
          return (
            <Link key={h} href={h} className="flex flex-col items-center justify-center py-2 text-[11px] font-semibold">
              <span className="-mt-5 flex h-12 w-12 items-center justify-center rounded-full bg-terracotta text-2xl text-white shadow">+</span>
              {l}
            </Link>
          );
        return (
          <Link key={h} href={h} className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${on ? "text-ink" : "text-umber"}`}>
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill={on ? "currentColor" : "none"} stroke="currentColor" strokeWidth={on ? 0 : 1.6}>
              <path d={d} />
            </svg>
            {l}
          </Link>
        );
      })}
    </nav>
  );
}
