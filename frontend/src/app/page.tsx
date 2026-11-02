import Link from "next/link";
import ProductCard from "@/components/ProductCard";
import { cities, type Page, type Product, type Thread } from "@/lib/data";
import { apiGet } from "@/lib/server-api";

export const dynamic = "force-dynamic";

const actions = [
  { t: "Buy", d: "Pre-loved pieces from across India", h: "/explore", c: "bg-ink text-canvas" },
  { t: "Sell", d: "List in 1 minute, get paid by UPI", h: "/sell", c: "bg-terracotta text-white" },
  { t: "Swap", d: "Trade clothes, no money needed", h: "/explore?swap=1", c: "bg-forest text-white" },
];
const steps = [
  ["Snap it", "Take a photo of something you no longer wear."],
  ["List it", "Add a price, or mark it open to swap."],
  ["Ship it", "Pack it up. We deliver anywhere in India."],
];

export default async function Home() {
  const [{ data: fresh }, { data: threads }] = await Promise.all([
    apiGet<Page<Product>>("/products?limit=8"),
    apiGet<Page<Thread>>("/threads?limit=2"),
  ]);
  return (
    <>
      <section className="pt-6 md:pt-14">
        <h1 className="font-serif text-[34px] leading-[40px] md:text-[56px] md:leading-[64px]">
          Buy, sell &amp; swap <em>pre-loved</em> clothes.
        </h1>
        <p className="mt-2 max-w-xl text-umber">India’s easy thrift shop. Prices in ₹, delivery across India.</p>
        <div className="mt-5 grid grid-cols-3 gap-2 md:gap-4">
          {actions.map((a) => (
            <Link key={a.t} href={a.h} className={`rounded-xl p-3 md:p-6 ${a.c}`}>
              <p className="font-serif text-2xl md:text-4xl">{a.t}</p>
              <p className="mt-1 text-xs opacity-80 md:text-sm">{a.d}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="mt-6 flex gap-2 overflow-x-auto pb-1">
        {cities.map((c) => (
          <Link key={c} href={`/explore?city=${c}`} className="shrink-0 rounded-full border border-line px-4 py-2 text-sm">{c}</Link>
        ))}
      </section>

      <section className="py-8">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="font-serif text-[26px] md:text-4xl">Fresh drops</h2>
          <Link href="/explore" className="text-sm font-semibold underline">See all</Link>
        </div>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4 md:gap-6">
          {fresh.map((p) => <ProductCard key={p.id} p={p} />)}
        </div>
      </section>

      <section className="rounded-xl bg-beige p-5 md:p-10">
        <h2 className="font-serif text-[26px] md:text-4xl">How it works</h2>
        <ol className="mt-4 grid gap-4 md:grid-cols-3">
          {steps.map(([t, d], i) => (
            <li key={t} className="flex gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink text-sm font-semibold text-canvas">{i + 1}</span>
              <div><p className="font-semibold">{t}</p><p className="text-sm text-umber">{d}</p></div>
            </li>
          ))}
        </ol>
        <Link href="/sell" className="mt-5 inline-block rounded-full bg-ink px-6 py-3 text-sm font-semibold text-canvas">Start selling</Link>
      </section>

      <section className="py-8">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="font-serif text-[26px] md:text-4xl">From Threads</h2>
          <Link href="/threads" className="text-sm font-semibold underline">Join in</Link>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {threads.map((t) => (
            <Link key={t.id} href="/threads" className="rounded-xl border border-line bg-white p-4">
              <p className="text-sm font-semibold">{t.author} <span className="font-normal text-umber">· {t.city}</span></p>
              <p className="mt-1 line-clamp-2 text-[15px]">{t.text}</p>
              <p className="mt-2 text-xs text-umber">♥ {t.likes} · 💬 {t.replyCount}</p>
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}
