import mongoose from "mongoose";

/**
 * `threads`: one post in the community feed. Replies and likes live in their own collections
 * (thread_replies, thread_likes) because both grow without limit; this document only keeps their counts.
 * Older documents still contain legacy `replies` / `likedBy` arrays; they're copied out by migration 002,
 * never read, and will be removed by a later migration.
 */
const threadSchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, immutable: true }, // public ID
    author: { type: String, required: true }, // display-name snapshot: no user lookup per post
    authorId: { type: String }, // users.uid (missing on seeded sample posts)
    city: { type: String, default: "" },
    kind: { type: String, enum: ["post", "looking", "swap"], default: "post" },
    text: { type: String, required: true, maxlength: 500 },
    productId: { type: String }, // products.slug, optional
    likes: { type: Number, default: 0, min: 0 }, // count, kept in step with thread_likes via $inc
    replyCount: { type: Number, default: 0, min: 0 }, // kept in step with thread_replies via $inc
    at: { type: Number, required: true }, // created time, epoch ms (existing field; the feed sorts on it)
  },
  { timestamps: true, collection: "threads" },
);

threadSchema.index({ slug: 1 }, { unique: true });
// The feed: newest first with cursor pagination.
threadSchema.index({ at: -1, _id: -1 });

export const Thread = mongoose.models.Thread ?? mongoose.model("Thread", threadSchema);
