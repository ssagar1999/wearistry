import { products } from "@/lib/data";

export default async function Exchange({ searchParams }: { searchParams: Promise<{ item?: string }> }) {
  const { item } = await searchParams;
  const swappable = products.filter((p) => p.exchange);
  return (
    <div className="max-w-xl py-8">
      <h1 className="font-serif text-[28px] md:text-4xl">Propose a swap</h1>
      <p className="mt-2 text-umber">Offer one of your pieces for another. Both sides ship within India.</p>
      <form className="mt-6 space-y-4">
        <label className="block text-sm font-medium">Piece you want
          <select defaultValue={item} className="mt-1 w-full rounded border border-line bg-white p-2">
            {swappable.map((p) => <option key={p.id} value={p.id}>{p.title} — {p.city}</option>)}
          </select>
        </label>
        <label className="block text-sm font-medium">What you’re offering
          <input className="mt-1 w-full rounded border border-line bg-white p-2" placeholder="e.g. Block-print kurta, size M" />
        </label>
        <label className="block text-sm font-medium">Your city / PIN code
          <input className="mt-1 w-full rounded border border-line bg-white p-2" placeholder="Pune · 411001" />
        </label>
        <button type="button" className="rounded bg-forest px-6 py-3 text-sm font-semibold text-white">Send swap request</button>
      </form>
    </div>
  );
}
