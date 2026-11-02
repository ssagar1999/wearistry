import mongoose from "mongoose";

/**
 * `sessions`: one document per logged-in browser. Read on every authenticated request.
 * Kept in its own collection (never an array on the user) because a user can log in from any number
 * of devices over time. Only a SHA-256 hash of the cookie token is stored, so a database leak
 * doesn't hand out working sessions.
 */
const sessionSchema = new mongoose.Schema(
  {
    tokenHash: { type: String, required: true },
    userId: { type: String, required: true }, // users.uid
    expiresAt: { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: "sessions" },
);

// Lookup by cookie on every request; also the future shard key (random, so no hotspots).
sessionSchema.index({ tokenHash: 1 }, { unique: true });
// MongoDB deletes expired sessions in the background (TTL), so the collection never grows unbounded.
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const Session = mongoose.models.Session ?? mongoose.model("Session", sessionSchema);
