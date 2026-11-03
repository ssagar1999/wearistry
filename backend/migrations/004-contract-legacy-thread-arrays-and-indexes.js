/**
 * DESTRUCTIVE (the "contract" step of the thread split started in 002). Run it only after the API has been
 * serving the new collections, and after confirming a backup or snapshot exists.
 *
 * 1. Removes the legacy embedded `replies` and `likedBy` arrays from `threads`. Before touching anything it
 *    checks that every embedded reply and like exists in `thread_replies` / `thread_likes`, and stops with an
 *    error if any are missing, so no data can be lost by running this too early.
 * 2. Drops indexes the web app created that no query uses any more: products.city_1, products.sellerSlug_1,
 *    threads.at_1 (replaced by the compound indexes) and threads.authorId_1.
 *
 * Not reversible by this script. The arrays' contents live on in the new collections; restoring the arrays
 * themselves would need a backup. Safe to rerun: it only acts on what is still there.
 */
export const id = "004-contract-legacy-thread-arrays-and-indexes";
export const description =
  "remove legacy threads.replies/likedBy (after verifying the copy); drop unused indexes";

const UNUSED_INDEXES = [
  ["products", "city_1"],
  ["products", "sellerSlug_1"],
  ["threads", "at_1"],
  ["threads", "authorId_1"],
];

/** @param {import("mongodb").Db} db */
export async function up(db) {
  const threads = db.collection("threads");
  const replies = db.collection("thread_replies");
  const likes = db.collection("thread_likes");

  // Safety check: every legacy reply and like must already be in the new collections.
  const cursor = threads.find(
    { $or: [{ "replies.0": { $exists: true } }, { "likedBy.0": { $exists: true } }] },
    { projection: { slug: 1, replies: 1, likedBy: 1 } },
  );
  for await (const thread of cursor) {
    const embeddedReplies = (thread.replies ?? []).length;
    const copiedReplies = await replies.countDocuments({ threadId: thread.slug });
    if (copiedReplies < embeddedReplies) {
      throw new Error(
        `Thread ${thread.slug}: ${embeddedReplies} embedded replies but only ${copiedReplies} copied. Run migration 002 first.`,
      );
    }
    const embeddedLikes = (thread.likedBy ?? []).length;
    const copiedLikes = await likes.countDocuments({ threadId: thread.slug });
    if (copiedLikes < embeddedLikes) {
      throw new Error(
        `Thread ${thread.slug}: ${embeddedLikes} embedded likes but only ${copiedLikes} copied. Run migration 002 first.`,
      );
    }
  }

  await threads.updateMany(
    { $or: [{ replies: { $exists: true } }, { likedBy: { $exists: true } }] },
    { $unset: { replies: "", likedBy: "" } },
  );

  for (const [collection, name] of UNUSED_INDEXES) {
    const exists = (await db.listCollections({ name: collection }).toArray()).length > 0;
    if (exists && (await db.collection(collection).indexes()).some((index) => index.name === name)) {
      await db.collection(collection).dropIndex(name);
    }
  }
}
