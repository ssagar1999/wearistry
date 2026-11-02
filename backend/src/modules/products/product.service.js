import { randomBytes } from "node:crypto";
import mongoose from "mongoose";
import { ApiError } from "../../utils/api-error.js";
import { cursorPaging } from "../../utils/pagination.js";
import { Product } from "./product.model.js";

const paging = cursorPaging("createdAt", "date");

// Only the fields responses need; never internal ones like sellerId.
const PUBLIC_PROJECTION = {
  _id: 1,
  slug: 1,
  title: 1,
  category: 1,
  size: 1,
  condition: 1,
  price: 1,
  mrp: 1,
  story: 1,
  image: 1,
  images: 1,
  city: 1,
  state: 1,
  exchange: 1,
  seller: 1,
  sellerSlug: 1,
  status: 1,
  createdAt: 1,
};

/**
 * @typedef {{ _id: mongoose.Types.ObjectId, slug: string, title: string, category: string, size: string,
 *   condition: string, price: number, mrp?: number | null, story?: string | null, image: string, images?: string[],
 *   city: string, state?: string | null, exchange?: boolean | null, seller: string, sellerSlug?: string | null,
 *   status?: string | null, createdAt: Date }} ProductRecord
 */

/** @param {ProductRecord} doc */
export function toPublicProduct(doc) {
  return {
    id: doc.slug,
    title: doc.title,
    category: doc.category,
    size: doc.size,
    condition: doc.condition,
    price: doc.price,
    mrp: doc.mrp ?? doc.price,
    story: doc.story ?? "",
    image: doc.image,
    images: doc.images?.length ? doc.images : [doc.image],
    city: doc.city,
    state: doc.state ?? "",
    exchange: Boolean(doc.exchange),
    seller: doc.seller,
    sellerSlug: doc.sellerSlug ?? "",
    status: doc.status ?? "active",
    createdAt: doc.createdAt.toISOString(),
  };
}

/** @typedef {ReturnType<typeof toPublicProduct>} PublicProduct */

/**
 * @param {{ limit: number, cursor?: string, city?: string, category?: string, condition?: string,
 *   exchange?: "true", q?: string, sellerSlug?: string, ids?: string[] }} query
 */
export async function listProducts(query) {
  if (query.ids) {
    // At most 50 IDs (schema limit): one indexed $in, returned in the caller's order. Sold items included,
    // so a saved item that sold still shows as sold instead of vanishing.
    const docs = await Product.find({ slug: mongoose.trusted({ $in: query.ids }) }, PUBLIC_PROJECTION).lean();
    const bySlug = new Map(docs.map((doc) => [doc.slug, doc]));
    const items = query.ids.flatMap((id) => {
      const doc = bySlug.get(id);
      return doc ? [toPublicProduct(doc)] : [];
    });
    return { items, nextCursor: null };
  }

  const filter = {
    status: "active",
    ...(query.city && { city: query.city }),
    ...(query.category && { category: query.category }),
    ...(query.condition && { condition: query.condition }),
    ...(query.exchange && { exchange: true }),
    ...(query.sellerSlug && { sellerSlug: query.sellerSlug }),
    ...(query.q && { $text: mongoose.trusted({ $search: query.q }) }),
    ...paging.after(query.cursor),
  };
  const docs = await Product.find(filter, PUBLIC_PROJECTION)
    .sort(paging.sort)
    .limit(query.limit + 1)
    .lean();
  const { items, nextCursor } = paging.page(docs, query.limit, (doc) => doc.createdAt);
  return { items: items.map(toPublicProduct), nextCursor };
}

/** @param {string} slug */
export async function getProduct(slug) {
  const doc = await Product.findOne({ slug }, PUBLIC_PROJECTION).lean();
  if (!doc) throw ApiError.notFound("This listing doesn't exist or was removed.");
  return toPublicProduct(doc);
}

/**
 * Small cards for listings referenced elsewhere (e.g. threads): one batched query, never one per item.
 *
 * @param {string[]} slugs
 * @returns {Promise<Map<string, { id: string, title: string, price: number, image: string }>>}
 */
export async function getProductCards(slugs) {
  if (!slugs.length) return new Map();
  const docs = await Product.find(
    { slug: mongoose.trusted({ $in: [...new Set(slugs)] }) },
    { _id: 0, slug: 1, title: 1, price: 1, image: 1 },
  ).lean();
  return new Map(
    docs.map((doc) => [doc.slug, { id: doc.slug, title: doc.title, price: doc.price, image: doc.image }]),
  );
}

/** @param {string} title */
function newSlug(title) {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  // Time plus randomness: unique without a lookup, and the unique index catches the near-impossible clash.
  return `${base || "listing"}-${Date.now().toString(36)}${randomBytes(2).toString("hex")}`;
}

/**
 * @param {{ id: string, name: string, phoneVerified: boolean }} seller
 * @param {{ title: string, category: string, size: string, condition: string, city: string, price: number,
 *   mrp?: number, story: string, exchange: boolean, images: string[] }} input
 * @param {(url: string) => boolean} isOwnPhotoUrl
 */
export async function createProduct(seller, input, isOwnPhotoUrl) {
  if (!seller.phoneVerified) throw ApiError.forbidden("Add a verified phone number before you sell.");
  if (!seller.name) throw ApiError.forbidden("Add your name to your profile before you sell.");
  // Photos must have been uploaded through our pipeline (resized, location data removed); never external links.
  if (!input.images.every(isOwnPhotoUrl))
    throw ApiError.badRequest("Some photos weren't uploaded to Wearistry.");

  const doc = await Product.create({
    ...input,
    slug: newSlug(input.title),
    image: input.images[0],
    seller: seller.name,
    sellerId: seller.id,
  });
  return toPublicProduct(doc.toObject());
}
