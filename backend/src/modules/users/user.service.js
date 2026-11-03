import { ApiError } from "../../utils/api-error.js";
import { User } from "./user.model.js";

const MONGO_DUPLICATE_KEY = 11000;
// Only what the API returns. Internal fields (_id, googleSub) are never loaded for responses.
const PUBLIC_PROJECTION = {
  _id: 0,
  uid: 1,
  name: 1,
  city: 1,
  phone: 1,
  phoneVerifiedAt: 1,
  email: 1,
  avatarUrl: 1,
};

/**
 * @typedef {{ uid: string, name?: string | null, city?: string | null, phone?: string | null,
 *   phoneVerifiedAt?: Date | null, email?: string | null, avatarUrl?: string | null }} UserRecord
 * @typedef {{ id: string, name: string, city: string, phone: string | null, phoneVerified: boolean,
 *   email: string | null, avatarUrl: string | null }} PublicUser
 */

/**
 * The user as the API returns it to themselves. Their own phone and email are included; other users
 * must never receive these.
 *
 * @param {UserRecord} user
 * @returns {PublicUser}
 */
export function toPublicUser(user) {
  return {
    id: user.uid,
    name: user.name ?? "",
    city: user.city ?? "",
    phone: user.phone ?? null,
    phoneVerified: Boolean(user.phoneVerifiedAt),
    email: user.email ?? null,
    avatarUrl: user.avatarUrl ?? null,
  };
}

/** @param {string} uid */
export async function findUserByUid(uid) {
  const user = await User.findOne({ uid }, PUBLIC_PROJECTION).lean();
  return user ? toPublicUser(user) : null;
}

/**
 * Finds the user who owns this verified phone, creating them on first login. A single upsert keyed on the
 * unique phone index, so two simultaneous first logins can't create two accounts.
 *
 * @param {string} phone
 */
export async function findOrCreateUserByPhone(phone) {
  const user = await User.findOneAndUpdate(
    { phone },
    { $set: { phoneVerifiedAt: new Date() } },
    { upsert: true, returnDocument: "after", projection: PUBLIC_PROJECTION, runValidators: true },
  ).lean();
  return toPublicUser(/** @type {UserRecord} */ (user));
}

/**
 * Finds the user by their stable Google account ID, creating them on first login. Name and photo are only
 * copied on creation, so later edits in Wearistry aren't overwritten on the next login.
 *
 * @param {{ sub: string, email?: string, emailVerified?: boolean, name?: string, picture?: string }} google
 */
export async function findOrCreateUserByGoogle(google) {
  const user = await User.findOneAndUpdate(
    { googleSub: google.sub },
    {
      ...(google.email && google.emailVerified && { $set: { email: google.email } }),
      $setOnInsert: {
        name: (google.name ?? "").slice(0, 40),
        ...(google.picture && { avatarUrl: google.picture }),
      },
    },
    { upsert: true, returnDocument: "after", projection: PUBLIC_PROJECTION, runValidators: true },
  ).lean();
  return toPublicUser(/** @type {UserRecord} */ (user));
}

/**
 * Adds a verified phone to an existing account (e.g. a Google user who wants to sell).
 *
 * @param {string} uid
 * @param {string} phone
 */
export async function attachVerifiedPhone(uid, phone) {
  try {
    const user = await User.findOneAndUpdate(
      { uid },
      { $set: { phone, phoneVerifiedAt: new Date() } },
      { returnDocument: "after", projection: PUBLIC_PROJECTION, runValidators: true },
    ).lean();
    if (!user) throw ApiError.unauthenticated();
    return toPublicUser(user);
  } catch (error) {
    // Merging two accounts is out of scope; tell the user clearly instead of a generic conflict.
    if (/** @type {{ code?: unknown }} */ (error).code === MONGO_DUPLICATE_KEY) {
      throw ApiError.conflict("This phone number is already linked to another Wearistry account.");
    }
    throw error;
  }
}

/**
 * @param {string} uid
 * @param {{ name: string, city: string }} profile
 */
export async function updateProfile(uid, profile) {
  const user = await User.findOneAndUpdate(
    { uid },
    { $set: profile },
    { returnDocument: "after", projection: PUBLIC_PROJECTION, runValidators: true },
  ).lean();
  if (!user) throw ApiError.notFound("Account not found.");
  return toPublicUser(user);
}

/**
 * A seller's public profile. Nameless accounts (never finished sign-up) aren't shown.
 *
 * @param {string} uid
 */
export async function getPublicProfile(uid) {
  const user = await User.findOne(
    { uid },
    { _id: 0, uid: 1, name: 1, city: 1, avatarUrl: 1, phoneVerifiedAt: 1, createdAt: 1 },
  ).lean();
  if (!user?.name) throw ApiError.notFound("This seller doesn't exist.");
  return {
    id: user.uid,
    name: user.name,
    city: user.city ?? "",
    avatarUrl: user.avatarUrl ?? null,
    verified: Boolean(user.phoneVerifiedAt),
    memberSince: user.createdAt.toISOString(),
  };
}
