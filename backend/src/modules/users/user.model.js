import { randomUUID } from "node:crypto";
import mongoose from "mongoose";

/**
 * `users`: one document per person. Shared with the frontend's existing data, so field names and the
 * public `uid` stay unchanged. Design notes, indexes and the sharding plan: docs/DATABASE.md, docs/SHARDING_STRATEGY.md.
 *
 * Login identities (phone, Google) are plain fields rather than an array: a person has at most a couple,
 * so the document stays small and bounded, and each identity gets its own unique index.
 */
const userSchema = new mongoose.Schema(
  {
    // Public, stable ID used in sessions and by other collections (threads.authorId). Never the ObjectId,
    // so internal IDs aren't exposed and records can move between databases without breaking references.
    uid: { type: String, required: true, immutable: true, default: () => randomUUID() },
    phone: { type: String, match: /^[6-9]\d{9}$/ },
    phoneVerifiedAt: { type: Date },
    googleSub: { type: String, maxlength: 255 },
    email: { type: String, lowercase: true, trim: true, maxlength: 254 },
    name: { type: String, trim: true, maxlength: 40, default: "" },
    city: { type: String, trim: true, maxlength: 40, default: "" },
    avatarUrl: { type: String, maxlength: 1000 },
  },
  { timestamps: true, collection: "users" },
);

// Session → user lookup on every authenticated request.
userSchema.index({ uid: 1 }, { unique: true });
// OTP login. Partial so the many users without a phone (Google-only) don't collide on "missing".
userSchema.index({ phone: 1 }, { unique: true, partialFilterExpression: { phone: { $type: "string" } } });
// Google login by the stable account ID ("sub"), never by email, which can change.
userSchema.index(
  { googleSub: 1 },
  { unique: true, partialFilterExpression: { googleSub: { $type: "string" } } },
);

/** @typedef {mongoose.InferSchemaType<typeof userSchema>} UserDocument */

export const User = mongoose.models.User ?? mongoose.model("User", userSchema);
