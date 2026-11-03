import Link from "next/link";
import LoadMoreProducts from "@/components/LoadMoreProducts";
import ProductCard from "@/components/ProductCard";
import { categories, cities, conditions, locations, stateOfCity, states, type Page, type Product } from "@/lib/data";
import { apiGet } from "@/lib/server-api";
import { currentUser } from "@/lib/session";

type SP = { q?: string; state?: string; city?: string; all?: string; category?: string; condition?: string; swap?: string };

export const dynamic = "force-dynamic";

export default async function Explore({ searchParams }: { searchParams: Promise<SP> }) {
  const f = await searchParams;
  // First visit with no location chosen: show the logged-in user's own state, with a one-tap way to see all of India.
  const homeState = stateOfCity((await currentUser())?.city ?? "");
  const chosen = f.city || f.state || f.all;
  if (!chosen && homeState) f.state = homeState;
  // A city implies its state, so only one of the two is sent.
  const state = f.city && cities.includes(f.city) ? "" : f.state && states.includes(f.state) ? f.state : "";
  // Only pass values the API accepts, so a hand-edited URL shows results instead of an error page.
  const filters = new URLSearchParams({ limit: "20" });
  if (f.q && f.q.trim().length >= 2) filters.set("q", f.q.trim().slice(0, 60));
  if (f.city && cities.includes(f.city)) filters.set("city", f.city);
  if (state) filters.set("state", state);
  if (f.category && categories.includes(f.category)) filters.set("category", f.category);
  if (f.condition && conditions.includes(f.condition)) filters.set("condition", f.condition);
  if (f.swap) filters.set("exchange", "true");
  const { data: list, meta } = await apiGet<Page<Product>>(`/products?${filters}`);
  // Builds a link that keeps current filters but changes one.
  const href = (patch: Partial<SP>) => {
    const sp = new URLSearchParams(Object.entries({ ...f, ...patch }).filter(([, v]) => v) as [string, string][]);
    return `/explore${sp.size ? `?${sp}` : ""}`;
  };
  const chip = (on: boolean) => `shrink-0 rounded-full px-4 py-2 text-sm ${on ? "bg-ink text-canvas" : "border border-line"}`;
  const sel = "w-full rounded-lg border border-line bg-white px-3 py-2.5 text-base";
  const active = [f.city || state, f.condition].filter(Boolean).length;
  const place = f.city && cities.includes(f.city) ? f.city : state;

  return (
    <div className="py-4 md:py-8">
      <form>
        <input name="q" defaultValue={f.q} type="search" placeholder="Search kurta, denim, saree…"
          className="w-full rounded-full border border-line bg-white px-5 py-3 text-base" />
        {f.category && <input type="hidden" name="category" value={f.category} />}
        {!state && !f.city && <input type="hidden" name="all" value="1" />}
        {f.swap && <input type="hidden" name="swap" value="1" />}
        <details className="mt-2">
          <summary className="cursor-pointer text-sm font-semibold">Location &amp; filters{active ? ` (${active})` : ""}</summary>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <select name="state" defaultValue={state} aria-label="State" className={sel}><option value="">All India</option>{states.map((x) => <option key={x}>{x}</option>)}</select>
            <select name="city" defaultValue={f.city ?? ""} aria-label="City" className={sel}>
              <option value="">Any city</option>
              {states.map((x) => <optgroup key={x} label={x}>{locations[x].map((c) => <option key={c}>{c}</option>)}</optgroup>)}
            </select>
            <select name="condition" defaultValue={f.condition ?? ""} className={sel}><option value="">Any condition</option>{conditions.map((c) => <option key={c}>{c}</option>)}</select>
            <button className="col-span-2 rounded-full bg-ink py-2.5 text-sm font-semibold text-canvas">Apply</button>
          </div>
        </details>
      </form>

      <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1">
        <Link href={href({ swap: f.swap ? undefined : "1" })} className={chip(!!f.swap)}>⇄ Swap only</Link>
        <Link href={href({ category: undefined })} className={chip(!f.category)}>All</Link>
        {categories.map((c) => (
          <Link key={c} href={href({ category: c })} className={chip(f.category === c)}>{c}</Link>
        ))}
      </div>

      <div className="mt-4 flex items-baseline justify-between text-sm text-umber">
        <span>{place ? `Showing ${place}` : "Showing all India"} · newest first</span>
        {place ? <Link href={href({ state: undefined, city: undefined, all: "1" })} className="underline">See all India</Link>
          : (f.q || f.category || f.condition || f.swap) && <Link href="/explore?all=1" className="underline">Clear all</Link>}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-4 md:grid-cols-4 md:gap-6">
        {list.map((p) => <ProductCard key={p.id} p={p} />)}
      </div>
      {meta.nextCursor && <LoadMoreProducts key={filters.toString()} query={filters.toString()} cursor={meta.nextCursor} />}
      {!list.length && <p className="py-20 text-center text-umber">{place ? `Nothing in ${place} yet. ` : "Nothing matches yet. "}Try another location or category.</p>}
    </div>
  );
}
