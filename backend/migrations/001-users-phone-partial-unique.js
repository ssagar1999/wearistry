/**
 * Lets users exist without a phone number (Google sign-in).
 *
 * Before: `phone_1` was a plain unique index, so only one document could lack a phone.
 * After:  `phone_1` is unique only where `phone` is a string. Existing phone users keep their uniqueness.
 * Also backfills `phoneVerifiedAt` for existing phone users: they could only be created by verifying an OTP.
 *
 * Safe to rerun: each step checks the current state first. Not destructive to data; the index is briefly
 * absent between drop and create (a duplicate phone inserted in that instant would be caught on create).
 */
export const id = "001-users-phone-partial-unique";
export const description = "users.phone unique only when set; backfill phoneVerifiedAt";

/** @param {import("mongodb").Db} db */
export async function up(db) {
  const users = db.collection("users");
  const exists = (await db.listCollections({ name: "users" }).toArray()).length > 0;
  if (exists) {
    const phoneIndex = (await users.indexes()).find((index) => index.name === "phone_1");
    if (phoneIndex && !phoneIndex.partialFilterExpression) await users.dropIndex("phone_1");
  }
  await users.createIndex(
    { phone: 1 },
    { name: "phone_1", unique: true, partialFilterExpression: { phone: { $type: "string" } } },
  );
  await users.updateMany({ phone: { $type: "string" }, phoneVerifiedAt: { $exists: false } }, [
    { $set: { phoneVerifiedAt: { $ifNull: ["$createdAt", "$$NOW"] } } },
  ]);
}
