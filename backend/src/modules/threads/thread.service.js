import { randomBytes } from "node:crypto";
import mongoose from "mongoose";
import { ApiError } from "../../utils/api-error.js";
import { cursorPaging } from "../../utils/pagination.js";
import { getProductCards } from "../products/product.service.js";
import { ThreadLike } from "./thread-like.model.js";
import { ThreadReply } from "./thread-reply.model.js";
import { Thread } from "./thread.model.js";

const MONGO_DUPLICATE_KEY = 11000;
const feedPaging = cursorPaging("at", "number");
const replyPaging = cursorPaging("createdAt", "date", "asc");
// Explicit fields: never load the legacy embedded arrays some older documents still carry.
const THREAD_PROJECTION = {
  slug: 1,
  author: 1,
  city: 1,
  kind: 1,
  text: 1,
  productId: 1,
  likes: 1,
  replyCount: 1,
  at: 1,
};

/**
 * @typedef {{ slug: string, author: string, city?: string | null, kind?: string | null, text: string,
 *   productId?: string | null, likes?: number | null, replyCount?: number | null, at: number }} ThreadRecord
 * @typedef {{ id: string, title: string, price: number, image: string }} ProductCard
 * @typedef {{ id: string, name: string, city: string }} Author
 */

/** @param {ThreadRecord} doc @param {boolean} liked @param {ProductCard | undefined} product */
function toPublicThread(doc, liked, product) {
  return {
    id: doc.slug,
    author: doc.author,
    city: doc.city ?? "",
    kind: /** @type {"post" | "looking" | "swap"} */ (doc.kind ?? "post"),
    text: doc.text,
    product: product ?? null,
    likes: Math.max(0, doc.likes ?? 0),
    liked,
    replyCount: doc.replyCount ?? 0,
    at: doc.at,
  };
}

/** @param {{ _id: unknown, author: string, text: string, createdAt: Date }} doc */
function toPublicReply(doc) {
  return { id: String(doc._id), author: doc.author, text: doc.text, at: doc.createdAt.getTime() };
}

/** @param {string} slug */
async function requireThread(slug) {
  if (!(await Thread.exists({ slug }))) throw ApiError.notFound("This thread doesn't exist.");
}

/** @param {Author} user */
function requireProfile(user) {
  if (!user.name) throw ApiError.forbidden("Add your name to your profile before posting.");
}

/**
 * The feed, newest first. Three queries per page however many threads it holds (no N+1): the threads,
 * which of them the viewer liked, and the listings they mention.
 *
 * @param {{ limit: number, cursor?: string }} page
 * @param {string | undefined} viewerId users.uid of the logged-in viewer
 */
export async function listThreads(page, viewerId) {
  const docs = await Thread.find(feedPaging.after(page.cursor), THREAD_PROJECTION)
    .sort(feedPaging.sort)
    .limit(page.limit + 1)
    .lean();
  const { items, nextCursor } = feedPaging.page(docs, page.limit, (doc) => doc.at);
  const slugs = items.map((doc) => doc.slug);

  const [likes, cards] = await Promise.all([
    viewerId
      ? ThreadLike.find(
          { userId: viewerId, threadId: mongoose.trusted({ $in: slugs }) },
          { _id: 0, threadId: 1 },
        ).lean()
      : [],
    getProductCards(items.flatMap((doc) => (doc.productId ? [doc.productId] : []))),
  ]);
  const liked = new Set(likes.map((like) => like.threadId));
  return {
    items: items.map((doc) => toPublicThread(doc, liked.has(doc.slug), cards.get(doc.productId ?? ""))),
    nextCursor,
  };
}

/**
 * @param {Author} author
 * @param {{ kind: "post" | "looking" | "swap", text: string, productId?: string }} input
 */
export async function createThread(author, input) {
  requireProfile(author);
  let product;
  if (input.productId) {
    product = (await getProductCards([input.productId])).get(input.productId);
    if (!product) throw ApiError.badRequest("That listing doesn't exist.");
  }
  const doc = await Thread.create({
    slug: `${Date.now().toString(36)}${randomBytes(3).toString("hex")}`,
    author: author.name,
    authorId: author.id,
    city: author.city,
    kind: input.kind,
    text: input.text,
    productId: input.productId,
    at: Date.now(),
  });
  return toPublicThread(doc.toObject(), false, product);
}

/**
 * Idempotent like: the unique (threadId, userId) index decides whether this is a new like, and only a new
 * like increments the counter. The two writes aren't one transaction; if the process died between them the
 * count could drift by one, which is acceptable for a like counter (see docs/DATABASE.md).
 *
 * @param {string} slug
 * @param {string} userId
 */
export async function likeThread(slug, userId) {
  await requireThread(slug);
  try {
    await ThreadLike.create({ threadId: slug, userId });
    await Thread.updateOne({ slug }, { $inc: { likes: 1 } });
  } catch (error) {
    if (/** @type {{ code?: unknown }} */ (error).code !== MONGO_DUPLICATE_KEY) throw error;
  }
  return { likes: await currentLikes(slug), liked: true };
}

/** Idempotent unlike; only removing an existing like decrements the counter. @param {string} slug @param {string} userId */
export async function unlikeThread(slug, userId) {
  await requireThread(slug);
  const { deletedCount } = await ThreadLike.deleteOne({ threadId: slug, userId });
  if (deletedCount === 1) {
    await Thread.updateOne({ slug, likes: mongoose.trusted({ $gt: 0 }) }, { $inc: { likes: -1 } });
  }
  return { likes: await currentLikes(slug), liked: false };
}

/** @param {string} slug */
async function currentLikes(slug) {
  const doc = await Thread.findOne({ slug }, { _id: 0, likes: 1 }).lean();
  return Math.max(0, doc?.likes ?? 0);
}

/**
 * A thread's replies, oldest first, page by page.
 *
 * @param {string} slug
 * @param {{ limit: number, cursor?: string }} page
 */
export async function listReplies(slug, page) {
  await requireThread(slug);
  const docs = await ThreadReply.find(
    { threadId: slug, ...replyPaging.after(page.cursor) },
    { author: 1, text: 1, createdAt: 1 },
  )
    .sort(replyPaging.sort)
    .limit(page.limit + 1)
    .lean();
  const { items, nextCursor } = replyPaging.page(docs, page.limit, (doc) => doc.createdAt);
  return { items: items.map(toPublicReply), nextCursor };
}

/**
 * @param {string} slug
 * @param {Author} author
 * @param {string} text
 */
export async function addReply(slug, author, text) {
  requireProfile(author);
  await requireThread(slug);
  const reply = await ThreadReply.create({ threadId: slug, authorId: author.id, author: author.name, text });
  await Thread.updateOne({ slug }, { $inc: { replyCount: 1 } });
  return toPublicReply(reply.toObject());
}
