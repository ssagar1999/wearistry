import { SESSION_COOKIE, findUserBySessionToken } from "../modules/auth/session.service.js";
import { ApiError } from "../utils/api-error.js";

/**
 * Attaches the logged-in user (if any) to `req.user`. An unknown or expired cookie simply means
 * "anonymous"; routes that need a user add `requireUser`.
 *
 * @param {import("express").Request} req
 * @param {import("express").Response} _res
 * @param {import("express").NextFunction} next
 */
export async function loadSession(req, _res, next) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (typeof token === "string" && token.length > 0 && token.length <= 128) {
    req.user = (await findUserBySessionToken(token)) ?? undefined;
  }
  next();
}

/**
 * @param {import("express").Request} req
 * @param {import("express").Response} _res
 * @param {import("express").NextFunction} next
 */
export function requireUser(req, _res, next) {
  if (!req.user) throw ApiError.unauthenticated();
  next();
}
