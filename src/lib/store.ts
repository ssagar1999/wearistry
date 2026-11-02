import { products, type Product } from "./data";

// Used when MONGODB_URI is unset: listings live in server memory until restart.
const g = globalThis as unknown as { _listings?: Product[] };
export const listings = (g._listings ??= [...products]);
