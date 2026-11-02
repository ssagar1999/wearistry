import { getLiveness, getReadiness } from "./health.service.js";

/**
 * @param {import("express").Request} _req
 * @param {import("express").Response} res
 */
export function liveness(_req, res) {
  res.json({ data: getLiveness() });
}

/**
 * @param {import("express").Request} _req
 * @param {import("express").Response} res
 */
export function readiness(_req, res) {
  const { ready, body } = getReadiness();
  res.status(ready ? 200 : 503).json({ data: body });
}
