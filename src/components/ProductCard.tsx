import Link from "next/link";
import Photo from "./Photo";
import SaveButton from "./SaveButton";
import { inr, type Product } from "@/lib/data";

export default function ProductCard({ p }: { p: Product }) {
  const off = Math.round((1 - p.price / p.mrp) * 100);
  return (
    <Link href={`/product/${p.id}`} className="group block">
      <div className="relative aspect-[3/4] overflow-hidden rounded bg-beige">
        <Photo src={p.image} alt={p.title} sizes="(min-width: 768px) 25vw, 50vw" className="transition group-hover:brightness-95" />
        <SaveButton id={p.id} className="absolute right-2 top-2" />
        {p.exchange && (
          <span className="label-tag absolute left-2 top-2 rounded-full bg-forest px-2 py-1 text-white">Swap OK</span>
        )}
      </div>
      <div className="mt-2 space-y-0.5">
        <p className="font-serif text-lg leading-tight">{p.title}</p>
        <p className="text-xs text-umber">{p.city} · Size {p.size} · {p.condition}</p>
        <p className="text-base font-semibold">
          {inr(p.price)}{" "}
          {off > 0 && (
            <>
              <span className="text-xs font-normal text-umber line-through">{inr(p.mrp)}</span>{" "}
              <span className="text-xs font-medium text-terracotta">{off}% off</span>
            </>
          )}
        </p>
      </div>
    </Link>
  );
}
