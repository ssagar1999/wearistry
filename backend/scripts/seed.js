// Usage: npm run seed. Fills an EMPTY development database with sample listings and threads, so a new
// developer sees a working site. Never runs in production, and never touches collections that have data.
import { readFile } from "node:fs/promises";
import mongoose from "mongoose";
import { connectDatabase } from "../src/config/database.js";
import { parseEnv } from "../src/config/env.js";
import { createLogger } from "../src/config/logger.js";
import { Product } from "../src/modules/products/product.model.js";
import { ThreadReply } from "../src/modules/threads/thread-reply.model.js";
import { Thread } from "../src/modules/threads/thread.model.js";

const env = parseEnv(process.env);
if (env.NODE_ENV === "production") {
  console.error("Refusing to seed a production database.");
  process.exit(1);
}
const logger = createLogger(env);
await connectDatabase(env.MONGODB_URI, logger);

const HOUR = 3_600_000;
const now = Date.now();

try {
  if ((await Product.estimatedDocumentCount()) === 0) {
    /** @type {Record<string, unknown>[]} */
    const products = JSON.parse(await readFile(new URL("./seed-products.json", import.meta.url), "utf8"));
    // Stagger creation times so "newest first" has a stable, realistic order.
    await Product.insertMany(products.map((p, i) => ({ ...p, createdAt: new Date(now - i * HOUR) })));
    console.log(`Seeded ${products.length} listings.`);
  } else console.log("products already has data; skipped.");

  if ((await Thread.estimatedDocumentCount()) === 0) {
    await Thread.insertMany([
      {
        slug: "t1",
        author: "Aarti Rao",
        city: "Jaipur",
        kind: "post",
        text: "Just listed a 90s Dabu wrap skirt. Natural indigo, no fading. Who else loves block prints?",
        productId: "dabu-block-print-wrap-skirt",
        likes: 24,
        replyCount: 2,
        at: now - 3 * HOUR,
      },
      {
        slug: "t2",
        author: "Kabir Joshi",
        city: "Pune",
        kind: "looking",
        text: "Looking for a vintage denim jacket, size L, under ₹2,000. Anyone in Pune?",
        likes: 8,
        replyCount: 0,
        at: now - 6 * HOUR,
      },
      {
        slug: "t3",
        author: "Meher Kapoor",
        city: "Delhi",
        kind: "swap",
        text: "Want to swap my Levi's 501 (32) for a linen shirt, size M. DM or reply here!",
        productId: "levi-s-501-selvedge-jeans",
        likes: 15,
        replyCount: 1,
        at: now - 26 * HOUR,
      },
      {
        slug: "t4",
        author: "The Bombay Attic",
        city: "Mumbai",
        kind: "post",
        text: "Friday drop at our Bandra store: 40 new pieces, mostly silk and linen. Online from 7pm.",
        likes: 41,
        replyCount: 0,
        at: now - 30 * HOUR,
      },
    ]);
    await ThreadReply.insertMany([
      {
        threadId: "t1",
        author: "Zoya Khan",
        text: "Gorgeous! Is the waist adjustable?",
        createdAt: new Date(now - 2 * HOUR),
      },
      {
        threadId: "t1",
        author: "Aarti Rao",
        text: "Yes, it's a full wrap, fits 26–32.",
        createdAt: new Date(now - HOUR),
      },
      {
        threadId: "t3",
        author: "Nisha Reddy",
        text: "I have a sand linen shirt, M. Interested?",
        createdAt: new Date(now - 20 * HOUR),
      },
    ]);
    console.log("Seeded 4 threads with 3 replies.");
  } else console.log("threads already has data; skipped.");
} finally {
  await mongoose.disconnect();
}
