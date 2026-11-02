import mongoose from "mongoose";
import { findUserByUid } from "../users/user.service.js";
import { randomToken, sha256 } from "./auth.crypto.js";
import { Session } from "./session.model.js";

export const SESSION_COOKIE = "wearistry_sid";
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * @param {string} userId users.uid
 * @param {number} ttlDays
 */
export async function createSession(userId, ttlDays) {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + ttlDays * DAY_MS);
  await Session.create({ tokenHash: sha256(token), userId, expiresAt });
  return { token, expiresAt };
}

/**
 * Resolves a session cookie to its user. Expired sessions are rejected here even before MongoDB's TTL
 * cleanup (which runs about once a minute) removes them.
 *
 * @param {string} token
 */
export async function findUserBySessionToken(token) {
  const session = await Session.findOne(
    { tokenHash: sha256(token), expiresAt: mongoose.trusted({ $gt: new Date() }) },
    { _id: 0, userId: 1 },
  ).lean();
  return session ? findUserByUid(session.userId) : null;
}

/** @param {string} token */
export async function deleteSession(token) {
  await Session.deleteOne({ tokenHash: sha256(token) });
}

/**
 * httpOnly: page scripts can't read it. SameSite=Lax: not sent on cross-site POSTs (CSRF), but still sent
 * when Google redirects the user back. Secure in production so it never travels over plain HTTP.
 *
 * @param {{ NODE_ENV: string }} env
 * @param {Date} [expiresAt]
 * @returns {import("express").CookieOptions}
 */
export function sessionCookieOptions(env, expiresAt) {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: env.NODE_ENV === "production",
    path: "/",
    ...(expiresAt && { expires: expiresAt }),
  };
}
