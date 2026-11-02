// Shared lists and types. Listings and threads come from the API (backend/); these are only the
// fixed choices the forms and filters offer, plus the curated sample-seller profiles.

/** A listing as returned by the API (GET /api/v1/products). */
export type Product = {
  id: string;
  title: string;
  category: string;
  size: string;
  condition: string;
  price: number;
  mrp: number;
  story: string;
  image: string;
  images: string[];
  city: string;
  state: string;
  exchange: boolean;
  seller: string;
  sellerSlug: string;
  status: string;
  createdAt: string;
};

/** A thread as returned by the API (GET /api/v1/threads). */
export type Thread = {
  id: string;
  author: string;
  city: string;
  kind: "post" | "looking" | "swap";
  text: string;
  product: { id: string; title: string; price: number; image: string } | null;
  likes: number;
  liked: boolean;
  replyCount: number;
  at: number;
};

export type Reply = { id: string; author: string; text: string; at: number };

/** Paginated list responses: pass `nextCursor` back as `cursor` for the next page. */
export type Page<T> = { data: T[]; meta: { nextCursor: string | null; limit: number } };

export const cities = ["Mumbai", "Delhi", "Bengaluru", "Kolkata", "Jaipur", "Pune", "Hyderabad", "Chennai", "Ahmedabad"];
export const categories = ["Jackets", "Shirts", "Sarees", "Dupattas", "Denim", "Tops", "Skirts", "Accessories"];
export const sizes = ["XS", "S", "M", "L", "XL", "Free size"];
export const conditions = ["Like new", "Excellent", "Good"];

export const inr = (n: number) => "₹" + n.toLocaleString("en-IN");

export const sellers = [
  { slug: "pooja-varma", name: "Pooja Varma", city: "Kolkata", bio: "Kantha and handloom, restitched with stories.", verified: true },
  { slug: "the-bombay-attic", name: "The Bombay Attic", city: "Mumbai", bio: "Independent thrift store in Bandra. New drops every Friday.", verified: true },
  { slug: "aarti-rao", name: "Aarti Rao", city: "Jaipur", bio: "Block prints, silks and brass from Rajasthan.", verified: true },
  { slug: "church-street-vintage", name: "Church Street Vintage", city: "Bengaluru", bio: "90s denim and utility wear off Church Street.", verified: true },
  { slug: "meher-kapoor", name: "Meher Kapoor", city: "Delhi", bio: "Shahpur Jat wardrobe clear-outs.", verified: false },
  { slug: "kabir-joshi", name: "Kabir Joshi", city: "Pune", bio: "College closet, mostly khadi.", verified: false },
  { slug: "nisha-reddy", name: "Nisha Reddy", city: "Hyderabad", bio: "Workwear that still has a few lives left.", verified: false },
  { slug: "arjun-menon", name: "Arjun Menon", city: "Chennai", bio: "Retro shirts and streetwear.", verified: false },
  { slug: "zoya-khan", name: "Zoya Khan", city: "Ahmedabad", bio: "Ajrakh and indigo, curated.", verified: false },
];
export const getSeller = (slug: string) => sellers.find((s) => s.slug === slug);
