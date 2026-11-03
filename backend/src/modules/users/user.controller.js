import { validated } from "../../middleware/validate.middleware.js";
import { ApiError } from "../../utils/api-error.js";
import { publicProfileParams, updateProfileBody } from "./user.schemas.js";
import { getPublicProfile, updateProfile } from "./user.service.js";

/**
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 */
export async function updateMyProfile(req, res) {
  if (!req.user) throw ApiError.unauthenticated();
  const profile = validated(req, "body", updateProfileBody);
  res.json({ data: { user: await updateProfile(req.user.id, profile) } });
}

/**
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 */
export async function getProfile(req, res) {
  const { id } = validated(req, "params", publicProfileParams);
  res.json({ data: await getPublicProfile(id) });
}
