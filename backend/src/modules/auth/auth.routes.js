import { Router } from "express";
import { requireUser } from "../../middleware/auth.middleware.js";
import { createRateLimiter } from "../../middleware/rate-limit.middleware.js";
import { validate } from "../../middleware/validate.middleware.js";
import { createAuthController } from "./auth.controller.js";
import { googleStartQuery, sendOtpBody, verifyOtpBody } from "./auth.schemas.js";
import { createGoogleClient } from "./google.client.js";
import { createGoogleAuthService } from "./google.service.js";
import { createOtpService } from "./otp.service.js";

// Login endpoints are brute-force targets, so they get a much tighter per-IP limit than the API default.
// Per-phone limits (30 s between codes, 5 per hour, 5 tries per code) are enforced in the OTP service.
const LOGIN_LIMIT_WINDOW_MS = 15 * 60_000;

/**
 * @param {{
 *   env: Readonly<import("../../config/env.js").Env>,
 *   logger: import("pino").Logger,
 *   googleClient?: import("./google.client.js").GoogleClient,
 * }} deps `googleClient` can be injected by tests; otherwise it's built from env when configured.
 */
export function createAuthRouter({ env, logger, googleClient }) {
  const google =
    googleClient ??
    (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? createGoogleClient({ clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET })
      : undefined);

  const controller = createAuthController({
    env,
    otp: createOtpService(env, logger),
    googleAuth: createGoogleAuthService(env, google),
  });
  const loginLimiter = createRateLimiter({ windowMs: LOGIN_LIMIT_WINDOW_MS, limit: env.AUTH_RATE_LIMIT_MAX });

  const router = Router();
  router.post("/otp/send", loginLimiter, validate({ body: sendOtpBody }), controller.sendOtp);
  router.post("/otp/verify", loginLimiter, validate({ body: verifyOtpBody }), controller.verifyOtp);
  router.get("/google/start", loginLimiter, validate({ query: googleStartQuery }), controller.googleStart);
  router.get("/google/callback", loginLimiter, controller.googleCallback);
  router.get("/me", requireUser, controller.me);
  router.post("/logout", controller.logout);
  return router;
}
