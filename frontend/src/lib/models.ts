import mongoose, { Schema, models, model } from "mongoose";

// Mirrors the Product type in data.ts so pages and API share one shape.
const ProductSchema = new Schema(
  {
    slug: { type: String, required: true, unique: true },
    title: { type: String, required: true, trim: true },
    category: String,
    size: String,
    condition: { type: String, enum: ["Like new", "Excellent", "Good"] },
    price: { type: Number, required: true, min: 0 }, // INR
    mrp: Number,
    story: String,
    image: String,
    images: [String],
    city: { type: String, required: true, index: true },
    state: String,
    pincode: { type: String, match: /^[1-9][0-9]{5}$/ },
    exchange: { type: Boolean, default: false },
    seller: String,
    sellerSlug: { type: String, index: true },
    status: { type: String, enum: ["active", "sold", "swapped"], default: "active" },
  },
  { timestamps: true },
);
ProductSchema.index({ title: "text", story: "text" });

export const ProductModel = (models.Product as mongoose.Model<any>) || model("Product", ProductSchema); // eslint-disable-line @typescript-eslint/no-explicit-any
