import { z } from "zod";
import { pageQuery } from "../../utils/pagination.js";
import { CATEGORIES, CITIES, CONDITIONS, MAX_PHOTOS, SIZES } from "./product.constants.js";

const slug = z.string().regex(/^[a-z0-9-]{1,120}$/, "Invalid listing ID.");

export const productParams = z.object({ id: slug }).strict();

export const listProductsQuery = z
  .object({
    ...pageQuery,
    city: z.enum(CITIES).optional(),
    category: z.enum(CATEGORIES).optional(),
    condition: z.enum(CONDITIONS).optional(),
    exchange: z.literal("true").optional(),
    q: z.string().trim().min(2).max(60).optional(),
    sellerSlug: slug.optional(),
    sellerId: z.uuid().optional(),
    // Specific listings by ID (saved items, thread cards): at most one page, returned in the given order.
    ids: z
      .string()
      .transform((value) => [...new Set(value.split(",").filter(Boolean))])
      .pipe(z.array(slug).min(1).max(50))
      .optional(),
  })
  .strict();

export const createProductBody = z
  .object({
    title: z.string().trim().min(2).max(80),
    category: z.enum(CATEGORIES),
    size: z.enum(SIZES),
    condition: z.enum(CONDITIONS),
    city: z.enum(CITIES),
    price: z.number().int().min(1).max(1_000_000),
    mrp: z.number().int().min(1).max(1_000_000).optional(),
    story: z.string().trim().max(2000).default(""),
    exchange: z.boolean().default(false),
    images: z.array(z.string().max(500)).min(1, "Add at least one photo.").max(MAX_PHOTOS),
  })
  .strict()
  .refine((body) => body.mrp === undefined || body.mrp >= body.price, {
    path: ["mrp"],
    message: "Original price can't be lower than your price.",
  });

const editable = {
  title: z.string().trim().min(2).max(80),
  category: z.enum(CATEGORIES),
  size: z.enum(SIZES),
  condition: z.enum(CONDITIONS),
  city: z.enum(CITIES),
  price: z.number().int().min(1).max(1_000_000),
  mrp: z.number().int().min(1).max(1_000_000),
  story: z.string().trim().max(2000),
  exchange: z.boolean(),
  status: z.enum(["active", "sold", "swapped"]),
};

/** Partial update of your own listing. Photos can't be changed yet; remove the listing and post it again. */
export const updateProductBody = z
  .object(editable)
  .partial()
  .strict()
  .refine((body) => Object.keys(body).length > 0, { message: "Send at least one field to change." });

export const listMyProductsQuery = z.object(pageQuery).strict();

export const PublicProduct = z
  .object({
    id: z.string(),
    title: z.string(),
    category: z.string(),
    size: z.string(),
    condition: z.string(),
    price: z.number(),
    mrp: z.number(),
    story: z.string(),
    image: z.string(),
    images: z.array(z.string()),
    city: z.string(),
    state: z.string(),
    exchange: z.boolean(),
    seller: z.string(),
    sellerSlug: z.string(),
    sellerId: z.string().nullable(),
    status: z.string(),
    createdAt: z.string(),
  })
  .meta({ id: "Product" });
