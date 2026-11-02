import mongoose from "mongoose";

/**
 * `thread_likes`: one row per (thread, user). The unique index is the "one like per person" rule, enforced
 * by the database rather than by a check-then-insert in code.
 */
const threadLikeSchema = new mongoose.Schema(
  {
    threadId: { type: String, required: true }, // threads.slug
    userId: { type: String, required: true }, // users.uid
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: "thread_likes" },
);

// Uniqueness, like/unlike, and "which of these 20 threads did I like?" ({ userId, threadId: { $in } }).
threadLikeSchema.index({ threadId: 1, userId: 1 }, { unique: true });

export const ThreadLike = mongoose.models.ThreadLike ?? mongoose.model("ThreadLike", threadLikeSchema);
