import { connectDB } from "./db";
import { ProductModel } from "./models";
import { products as seed, type Product } from "./data";
import { listings } from "./store";

export type Filters = { q?: string; city?: string; category?: string; condition?: string; swap?: boolean; sellerSlug?: string };

const hasDb = () => !!process.env.MONGODB_URI;
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

type Doc = { slug: string } & Omit<Product, "id">;
const toProduct = (d: Doc): Product => ({
  id: d.slug, title: d.title, city: d.city, state: d.state ?? "", seller: d.seller ?? "", sellerSlug: d.sellerSlug ?? "",
  price: d.price, mrp: d.mrp ?? d.price, size: d.size ?? "", condition: d.condition ?? "", category: d.category ?? "",
  story: d.story ?? "", image: d.image ?? "", images: d.images?.length ? d.images : undefined, exchange: !!d.exchange,
});

// Seeds the sample listings once per server process, the first time the database is empty.
let seeded: Promise<void> | undefined;
async function db() {
  await connectDB();
  seeded ??= (async () => {
    if ((await ProductModel.estimatedDocumentCount()) > 0) return;
    await ProductModel.insertMany(seed.map(({ id, ...rest }) => ({ slug: id, ...rest })), { ordered: false })
      .catch((e) => { if (e?.code !== 11000) throw e; }); // another server already seeded
  })();
  await seeded;
}

export async function listProducts(f: Filters = {}): Promise<Product[]> {
  if (!hasDb()) {
    const q = f.q?.toLowerCase();
    return listings.filter((p) =>
      (!q || p.title.toLowerCase().includes(q)) && (!f.city || p.city === f.city) &&
      (!f.category || p.category === f.category) && (!f.condition || p.condition === f.condition) &&
      (!f.swap || p.exchange) && (!f.sellerSlug || p.sellerSlug === f.sellerSlug));
  }
  await db();
  const filter: Record<string, unknown> = { status: "active" };
  if (f.q) filter.title = { $regex: esc(f.q), $options: "i" };
  if (f.city) filter.city = f.city;
  if (f.category) filter.category = f.category;
  if (f.condition) filter.condition = f.condition;
  if (f.swap) filter.exchange = true;
  if (f.sellerSlug) filter.sellerSlug = f.sellerSlug;
  return (await ProductModel.find(filter).sort({ createdAt: -1 }).limit(100).lean()).map(toProduct);
}

export async function getProduct(id: string): Promise<Product | undefined> {
  if (!hasDb()) return listings.find((p) => p.id === id);
  await db();
  const d = await ProductModel.findOne({ slug: id }).lean();
  return d ? toProduct(d) : undefined;
}

export async function createProduct(p: Omit<Product, "id">): Promise<string> {
  const id = `${p.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now().toString(36)}`;
  if (!hasDb()) { listings.unshift({ id, ...p }); return id; }
  await db();
  await ProductModel.create({ slug: id, ...p });
  return id;
}
