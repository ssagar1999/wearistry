import { validated } from "../../middleware/validate.middleware.js";
import { ApiError } from "../../utils/api-error.js";
import { updateProfileBody } from "./user.schemas.js";
import { updateProfile } from "./user.service.js";

/**
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 */
export async function updateMyProfile(req, res) {
  if (!req.user) throw ApiError.unauthenticated();
  const profile = validated(req, "body", updateProfileBody);
  res.json({ data: { user: await updateProfile(req.user.id, profile) } });
}
