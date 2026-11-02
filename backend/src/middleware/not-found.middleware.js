import { ApiError } from "../utils/api-error.js";

/**
 * @param {import("express").Request} req
 * @param {import("express").Response} _res
 * @param {import("express").NextFunction} next
 */
export function notFound(req, _res, next) {
  next(ApiError.notFound(`No route for ${req.method} ${req.path}.`));
}
