import mongoose from "mongoose";
import { CONDITIONS, MAX_PHOTOS } from "./product.constants.js";

/**
 * `products`: one listing. Read-heavy (browse, search, product pages). Field names match the data the web
 * app already wrote, so existing listings keep working. Design, query costs and the sharding plan:
 * docs/DATABASE.md, docs/SCALABILITY.md, docs/SHARDING_STRATEGY.md.
 */
const productSchema = new mongoose.Schema(
  {
    // Public, URL-friendly ID ("indigo-kantha-jacket-mvz6xqjq"). Used in URLs and by threads.productId.
    slug: { type: String, required: true, immutable: true },
    title: { type: String, required: true, trim: true, maxlength: 80 },
    category: { type: String, required: true },
    size: { type: String, required: true },
    condition: { type: String, enum: CONDITIONS, required: true },
    price: { type: Number, required: true, min: 1 }, // whole rupees
    mrp: { type: Number, min: 1 },
    story: { type: String, maxlength: 2000, default: "" },
    image: { type: String, required: true }, // cover = images[0], kept separately for cheap list projections
    // Embedded: bounded (≤ 8), owned by the listing and always shown with it.
    images: {
      type: [String],
      validate: [
        (/** @type {string[]} */ images) => images.length >= 1 && images.length <= MAX_PHOTOS,
        "1 to 8 photos",
      ],
    },
    city: { type: String, required: true },
    state: { type: String, default: "" },
    exchange: { type: Boolean, default: false },
    // Seller name is a snapshot so feeds don't need a user lookup per listing (no N+1).
    seller: { type: String, required: true },
    sellerSlug: { type: String, default: "" }, // curated sample sellers (static profiles in the web app)
    sellerId: { type: String }, // users.uid of the seller; missing on listings created before ownership existed
    status: { type: String, enum: ["active", "sold", "swapped"], default: "active" },
  },
  { timestamps: true, collection: "products" },
);

productSchema.index({ slug: 1 }, { unique: true });
// Browse, newest first, with cursor pagination. ESR: equality (status, then city/category) → sort (createdAt, _id).
productSchema.index({ status: 1, createdAt: -1, _id: -1 });
productSchema.index({ status: 1, city: 1, createdAt: -1, _id: -1 });
productSchema.index({ status: 1, category: 1, createdAt: -1, _id: -1 });
// Seller pages. Partial: most listings have no sellerSlug, and old ones have no sellerId.
productSchema.index(
  { sellerSlug: 1, createdAt: -1, _id: -1 },
  { partialFilterExpression: { sellerSlug: { $gt: "" } } },
);
productSchema.index(
  { sellerId: 1, createdAt: -1, _id: -1 },
  { partialFilterExpression: { sellerId: { $type: "string" } } },
);
// Keyword search (existing index, same name the web app created). Atlas Search is the planned upgrade.
productSchema.index({ title: "text", story: "text" }, { name: "title_text_story_text" });

export const Product = mongoose.models.Product ?? mongoose.model("Product", productSchema);
