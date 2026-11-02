import { NextResponse } from "next/server";
import { z } from "zod";
import { cities } from "@/lib/data";
import { isOwnPhotoUrl } from "@/lib/images";
import { createProduct, listProducts } from "@/lib/repo";
import { currentUser } from "@/lib/session";

const body = z.object({
  title: z.string().min(2),
  price: z.number().positive(),
  mrp: z.number().positive().optional(),
  city: z.enum(cities as [string, ...string[]]),
  category: z.string().optional(),
  size: z.string().optional(),
  condition: z.string().optional(),
  story: z.string().optional(),
  exchange: z.boolean().optional(),
  images: z.array(z.string().refine(isOwnPhotoUrl, "Unknown photo")).min(1).max(8),
});

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  return NextResponse.json(await listProducts({ city: sp.get("city") ?? undefined, q: sp.get("q") ?? undefined }));
}

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user?.name) return NextResponse.json({ error: "Please log in to sell." }, { status: 401 });
  const parsed = body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json(parsed.error.flatten(), { status: 400 });
  const d = parsed.data;
  const id = await createProduct({
    title: d.title, city: d.city, state: "", seller: user.name, sellerSlug: "", price: d.price, mrp: d.mrp ?? d.price,
    size: d.size ?? "Free size", condition: d.condition ?? "Good", category: d.category ?? "Tops", story: d.story ?? "",
    image: d.images[0], images: d.images, exchange: !!d.exchange,
  });
  return NextResponse.json({ id }, { status: 201 });
}
