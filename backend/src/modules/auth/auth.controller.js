import { validated } from "../../middleware/validate.middleware.js";
import { ApiError } from "../../utils/api-error.js";
import { attachVerifiedPhone, findOrCreateUserByPhone } from "../users/user.service.js";
import { googleStartQuery, sendOtpBody, verifyOtpBody } from "./auth.schemas.js";
import { OAUTH_CALLBACK_PATH, OAUTH_STATE_COOKIE } from "./google.service.js";
import { SESSION_COOKIE, createSession, deleteSession, sessionCookieOptions } from "./session.service.js";

/** @typedef {import("express").Request} Request */
/** @typedef {import("express").Response} Response */

/**
 * @param {{
 *   env: Readonly<import("../../config/env.js").Env>,
 *   otp: ReturnType<typeof import("./otp.service.js").createOtpService>,
 *   googleAuth: ReturnType<typeof import("./google.service.js").createGoogleAuthService>,
 * }} deps
 */
export function createAuthController({ env, otp, googleAuth }) {
  const oauthCookie = /** @type {import("express").CookieOptions} */ ({
    ...sessionCookieOptions(env),
    path: OAUTH_CALLBACK_PATH,
    maxAge: 10 * 60_000,
  });

  /** @param {Response} res @param {string} userId */
  async function startSession(res, userId) {
    const { token, expiresAt } = await createSession(userId, env.SESSION_TTL_DAYS);
    res.cookie(SESSION_COOKIE, token, sessionCookieOptions(env, expiresAt));
  }

  return {
    /** @param {Request} req @param {Response} res */
    async sendOtp(req, res) {
      const { phone } = validated(req, "body", sendOtpBody);
      const { devCode } = await otp.sendCode(phone);
      res.json({ data: { sent: true, ...(devCode && { devCode }) } });
    },

    /**
     * Logs in with a phone code. If someone is already logged in (e.g. with Google), the verified phone is
     * added to their account instead of switching accounts.
     *
     * @param {Request} req @param {Response} res
     */
    async verifyOtp(req, res) {
      const { phone, code } = validated(req, "body", verifyOtpBody);
      await otp.verifyCode(phone, code);
      if (req.user) {
        const user = await attachVerifiedPhone(req.user.id, phone);
        return res.json({ data: { user, needsProfile: !user.name } });
      }
      const user = await findOrCreateUserByPhone(phone);
      await startSession(res, user.id);
      res.json({ data: { user, needsProfile: !user.name } });
    },

    /** @param {Request} req @param {Response} res */
    async googleStart(req, res) {
      const { returnTo } = validated(req, "query", googleStartQuery);
      const { url, state } = await googleAuth.start(returnTo);
      res.cookie(OAUTH_STATE_COOKIE, state, oauthCookie);
      res.redirect(302, url);
    },

    /**
     * The browser arrives here from Google, so failures redirect to the login page with a reason
     * instead of showing raw JSON.
     *
     * @param {Request} req @param {Response} res
     */
    async googleCallback(req, res) {
      res.clearCookie(OAUTH_STATE_COOKIE, { ...oauthCookie, maxAge: undefined });
      if (req.query.error)
        return res.redirect(302, new URL("/login?error=google_cancelled", env.APP_URL).toString());
      try {
        const { user, returnTo } = await googleAuth.finish({
          // Rebuilt from APP_URL because Google redirected the browser to the web app, which proxied here.
          callbackUrl: new URL(req.originalUrl, env.APP_URL),
          stateFromCookie: req.cookies?.[OAUTH_STATE_COOKIE],
        });
        await startSession(res, user.id);
        const next = user.name ? returnTo : `/login?step=profile&next=${encodeURIComponent(returnTo)}`;
        res.redirect(302, new URL(next, env.APP_URL).toString());
      } catch (error) {
        req.log.warn({ err: error }, "Google sign-in failed");
        const reason =
          error instanceof ApiError && error.status === 503 ? "google_unavailable" : "google_failed";
        res.redirect(302, new URL(`/login?error=${reason}`, env.APP_URL).toString());
      }
    },

    /** @param {Request} req @param {Response} res */
    me(req, res) {
      res.json({ data: { user: req.user } });
    },

    /** @param {Request} req @param {Response} res */
    async logout(req, res) {
      const token = req.cookies?.[SESSION_COOKIE];
      if (typeof token === "string" && token) await deleteSession(token);
      res.clearCookie(SESSION_COOKIE, sessionCookieOptions(env));
      res.status(204).end();
    },
  };
}
