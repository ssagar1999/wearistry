import mongoose from "mongoose";

/**
 * `thread_replies`: one reply. Its own collection because a popular thread can collect any number of
 * replies, which would make an embedded array grow without limit (16 MB document cap, slow rewrites).
 */
const threadReplySchema = new mongoose.Schema(
  {
    threadId: { type: String, required: true }, // threads.slug
    authorId: { type: String }, // users.uid (missing on replies migrated from before accounts had IDs)
    author: { type: String, required: true }, // display-name snapshot
    text: { type: String, required: true, maxlength: 500 },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: "thread_replies" },
);

// A thread's replies, oldest first, page by page. Also the future shard key prefix (threadId).
threadReplySchema.index({ threadId: 1, createdAt: 1, _id: 1 });

export const ThreadReply = mongoose.models.ThreadReply ?? mongoose.model("ThreadReply", threadReplySchema);
