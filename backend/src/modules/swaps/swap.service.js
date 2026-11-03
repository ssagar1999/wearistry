import mongoose from "mongoose";
import { ApiError } from "../../utils/api-error.js";
import { cursorPaging } from "../../utils/pagination.js";
import { Product } from "../products/product.model.js";
import { User } from "../users/user.model.js";
import { SwapRequest } from "./swap-request.model.js";

const MONGO_DUPLICATE_KEY = 11000;
const paging = cursorPaging("createdAt", "date");

/**
 * @typedef {{ _id: mongoose.Types.ObjectId, productId: string, productTitle: string, productImage: string,
 *   ownerId: string, ownerName: string, requesterId: string, requesterName: string, offer: string, note?: string | null,
 *   status: "pending" | "accepted" | "declined" | "cancelled", createdAt: Date }} SwapRecord
 */

/**
 * @param {SwapRecord} doc
 * @param {string} viewerId
 * @param {Map<string, string>} phones phones by users.uid, only for the people we may reveal
 */
function toView(doc, viewerId, phones) {
  const viewerIsOwner = doc.ownerId === viewerId;
  const counterpart = viewerIsOwner
    ? { id: doc.requesterId, name: doc.requesterName }
    : { id: doc.ownerId, name: doc.ownerName };
  return {
    id: String(doc._id),
    product: { id: doc.productId, title: doc.productTitle, image: doc.productImage },
    offer: doc.offer,
    note: doc.note ?? "",
    status: doc.status,
    createdAt: doc.createdAt.getTime(),
    counterpart,
    // Contact details change hands only when the owner has said yes.
    contactPhone: doc.status === "accepted" ? (phones.get(counterpart.id) ?? null) : null,
  };
}

/** One batched lookup for every accepted request in a page (no query per item). */
async function phonesForAccepted(/** @type {SwapRecord[]} */ docs, /** @type {string} */ viewerId) {
  const wanted = [
    ...new Set(
      docs
        .filter((doc) => doc.status === "accepted")
        .map((doc) => (doc.ownerId === viewerId ? doc.requesterId : doc.ownerId)),
    ),
  ];
  if (!wanted.length) return new Map();
  const users = await User.find(
    { uid: mongoose.trusted({ $in: wanted }) },
    { _id: 0, uid: 1, phone: 1 },
  ).lean();
  return new Map(users.flatMap((user) => (user.phone ? [[user.uid, user.phone]] : [])));
}

/**
 * @param {{ id: string, name: string, phoneVerified: boolean }} requester
 * @param {{ productId: string, offer: string, note: string }} input
 */
export async function createSwapRequest(requester, input) {
  if (!requester.phoneVerified) throw ApiError.forbidden("Add a verified phone number before you swap.");
  if (!requester.name) throw ApiError.forbidden("Add your name to your profile before you swap.");

  const product = await Product.findOne(
    { slug: input.productId, status: "active" },
    { slug: 1, title: 1, image: 1, exchange: 1, sellerId: 1, seller: 1 },
  ).lean();
  if (!product) throw ApiError.notFound("This listing isn't available.");
  if (!product.exchange) throw ApiError.badRequest("The seller hasn't opened this piece to swaps.");
  if (!product.sellerId) throw ApiError.badRequest("This seller can't receive swap requests yet.");
  if (product.sellerId === requester.id) throw ApiError.badRequest("That's your own listing.");

  try {
    const doc = await SwapRequest.create({
      productId: product.slug,
      productTitle: product.title,
      productImage: product.image,
      ownerId: product.sellerId,
      ownerName: product.seller,
      requesterId: requester.id,
      requesterName: requester.name,
      offer: input.offer,
      note: input.note,
    });
    return toView(doc.toObject(), requester.id, new Map());
  } catch (error) {
    if (/** @type {{ code?: unknown }} */ (error).code === MONGO_DUPLICATE_KEY) {
      throw ApiError.conflict("You already have a pending request for this piece.");
    }
    throw error;
  }
}

/**
 * @param {string} userId
 * @param {{ box: "received" | "sent", limit: number, cursor?: string }} query
 */
export async function listSwapRequests(userId, query) {
  const owner = query.box === "received";
  const docs = await SwapRequest.find({
    [owner ? "ownerId" : "requesterId"]: userId,
    ...paging.after(query.cursor),
  })
    .sort(paging.sort)
    .limit(query.limit + 1)
    .lean();
  const { items, nextCursor } = paging.page(docs, query.limit, (doc) => doc.createdAt);
  const phones = await phonesForAccepted(items, userId);
  return { items: items.map((doc) => toView(doc, userId, phones)), nextCursor };
}

const TRANSITIONS = /** @type {const} */ ({
  accept: { by: "ownerId", to: "accepted" },
  decline: { by: "ownerId", to: "declined" },
  cancel: { by: "requesterId", to: "cancelled" },
});

/**
 * The owner accepts or declines; the requester cancels. Only a pending request can change, and that
 * check is part of the update itself, so two simultaneous decisions can't both succeed.
 *
 * @param {string} userId
 * @param {string} id
 * @param {"accept" | "decline" | "cancel"} action
 */
export async function decideSwapRequest(userId, id, action) {
  const rule = TRANSITIONS[action];
  const updated = await SwapRequest.findOneAndUpdate(
    { _id: id, [rule.by]: userId, status: "pending" },
    { $set: { status: rule.to } },
    { returnDocument: "after" },
  ).lean();

  if (!updated) {
    const existing = await SwapRequest.findById(id, { ownerId: 1, requesterId: 1, status: 1 }).lean();
    // Strangers learn nothing about requests they aren't part of.
    if (!existing || (existing.ownerId !== userId && existing.requesterId !== userId)) {
      throw ApiError.notFound("Swap request not found.");
    }
    if (existing[rule.by] !== userId) throw ApiError.forbidden("You can't do that on this request.");
    throw ApiError.conflict(`This request was already ${existing.status}.`);
  }
  const phones = await phonesForAccepted([updated], userId);
  return toView(updated, userId, phones);
}
