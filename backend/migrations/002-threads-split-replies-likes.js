/**
 * Moves thread replies and likes out of the thread document into their own collections
 * (thread_replies, thread_likes), because both can grow without limit.
 *
 * Expand step only: copies data and sets the new `replyCount`; the legacy `replies` and `likedBy` arrays are
 * left in place (new code never reads them) and are removed by a later "contract" migration once every
 * running app version uses the new collections. Nothing is deleted.
 *
 * Safe to rerun: replies keep their original _id (upsert), likes upsert on the unique (threadId, userId)
 * pair, and replyCount is recomputed from thread_replies.
 */
export const id = "002-threads-split-replies-likes";
export const description =
  "copy embedded thread replies/likes into thread_replies/thread_likes; set replyCount";

const BATCH_SIZE = 500;

/** @param {import("mongodb").Db} db */
export async function up(db) {
  const threads = db.collection("threads");
  const replies = db.collection("thread_replies");
  const likes = db.collection("thread_likes");

  // Indexes first, so the upserts below are fast and the like uniqueness rule holds from the start.
  await replies.createIndex({ threadId: 1, createdAt: 1, _id: 1 });
  await likes.createIndex({ threadId: 1, userId: 1 }, { unique: true });

  /** @type {import("mongodb").AnyBulkWriteOperation[]} */
  let replyOps = [];
  /** @type {import("mongodb").AnyBulkWriteOperation[]} */
  let likeOps = [];
  const flush = async () => {
    if (replyOps.length) await replies.bulkWrite(replyOps, { ordered: false });
    if (likeOps.length) await likes.bulkWrite(likeOps, { ordered: false });
    replyOps = [];
    likeOps = [];
  };

  // Streams thread by thread (a cursor, not the whole collection in memory), writing in batches.
  const cursor = threads.find(
    { $or: [{ "replies.0": { $exists: true } }, { "likedBy.0": { $exists: true } }] },
    { projection: { slug: 1, replies: 1, likedBy: 1 } },
  );
  for await (const thread of cursor) {
    for (const reply of thread.replies ?? []) {
      replyOps.push({
        updateOne: {
          filter: { _id: reply._id },
          update: {
            $setOnInsert: {
              threadId: thread.slug,
              author: reply.author,
              text: reply.text,
              createdAt: new Date(reply.at),
            },
          },
          upsert: true,
        },
      });
    }
    for (const userId of thread.likedBy ?? []) {
      likeOps.push({
        updateOne: {
          filter: { threadId: thread.slug, userId },
          update: { $setOnInsert: { createdAt: new Date() } },
          upsert: true,
        },
      });
    }
    if (replyOps.length + likeOps.length >= BATCH_SIZE) await flush();
  }
  await flush();

  // replyCount for every thread (0 where there are none), from the source of truth.
  const counts = await replies.aggregate([{ $group: { _id: "$threadId", n: { $sum: 1 } } }]).toArray();
  const withReplies = counts.map((count) => count._id);
  if (counts.length) {
    await threads.bulkWrite(
      counts.map((count) => ({
        updateOne: { filter: { slug: count._id }, update: { $set: { replyCount: count.n } } },
      })),
      { ordered: false },
    );
  }
  await threads.updateMany({ slug: { $nin: withReplies } }, { $set: { replyCount: 0 } });
}
