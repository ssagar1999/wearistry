import { z } from "zod";
import { pageQuery } from "../../utils/pagination.js";

const threadId = z.string().regex(/^[a-z0-9-]{1,40}$/, "Invalid thread ID.");
const productId = z.string().regex(/^[a-z0-9-]{1,120}$/, "Invalid listing ID.");

export const threadParams = z.object({ id: threadId }).strict();
export const listThreadsQuery = z.object(pageQuery).strict();
export const listRepliesQuery = z.object(pageQuery).strict();

export const createThreadBody = z
  .object({
    kind: z.enum(["post", "looking", "swap"]).default("post"),
    text: z.string().trim().min(2, "Write a few words.").max(500),
    productId: productId.optional(),
  })
  .strict();

export const createReplyBody = z.object({ text: z.string().trim().min(1).max(500) }).strict();

const ProductCard = z.object({ id: z.string(), title: z.string(), price: z.number(), image: z.string() });

export const PublicThread = z
  .object({
    id: z.string(),
    author: z.string(),
    city: z.string(),
    kind: z.enum(["post", "looking", "swap"]),
    text: z.string(),
    product: ProductCard.nullable(),
    likes: z.number(),
    liked: z.boolean(),
    replyCount: z.number(),
    at: z.number().meta({ description: "Created time, epoch milliseconds" }),
  })
  .meta({ id: "Thread" });

export const PublicReply = z
  .object({ id: z.string(), author: z.string(), text: z.string(), at: z.number() })
  .meta({ id: "Reply" });
