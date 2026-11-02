import { ApiError, ErrorCode } from "../../utils/api-error.js";
import { findOrCreateUserByGoogle } from "../users/user.service.js";
import { hmac, safeEqual } from "./auth.crypto.js";
import { OAuthState } from "./oauth-state.model.js";

const STATE_TTL_MS = 10 * 60_000;
export const OAUTH_STATE_COOKIE = "wearistry_oauth";
export const OAUTH_CALLBACK_PATH = "/api/v1/auth/google/callback";

/**
 * Google sign-in (OAuth 2.0 Authorization Code flow with PKCE and OpenID Connect).
 *
 * @param {Pick<import("../../config/env.js").Env, "APP_URL" | "AUTH_SECRET">} env
 * @param {import("./google.client.js").GoogleClient | undefined} google undefined when not configured
 */
export function createGoogleAuthService(env, google) {
  const redirectUri = new URL(OAUTH_CALLBACK_PATH, env.APP_URL).toString();
  const hashState = (/** @type {string} */ state) => hmac(env.AUTH_SECRET, `oauth-state:${state}`);

  function requireGoogle() {
    if (!google) {
      throw new ApiError(503, ErrorCode.SERVICE_UNAVAILABLE, "Google sign-in is not available right now.");
    }
    return google;
  }

  return {
    isConfigured: Boolean(google),

    /**
     * @param {string} returnTo an already-validated path on our site
     * @returns {Promise<{ url: string, state: string }>}
     */
    async start(returnTo) {
      const client = requireGoogle();
      const { state, nonce, codeVerifier } = client.newLoginSecrets();
      await OAuthState.create({
        stateHash: hashState(state),
        codeVerifier,
        nonce,
        returnTo,
        expiresAt: new Date(Date.now() + STATE_TTL_MS),
      });
      return { url: await client.authorizationUrl({ redirectUri, state, nonce, codeVerifier }), state };
    },

    /**
     * Finishes sign-in. The state in Google's redirect must match the cookie set on this browser at
     * start, which stops an attacker from logging a victim into the attacker's account.
     *
     * @param {{ callbackUrl: URL, stateFromCookie: string | undefined }} params
     */
    async finish({ callbackUrl, stateFromCookie }) {
      const client = requireGoogle();
      const state = callbackUrl.searchParams.get("state");
      if (!state || !stateFromCookie || !safeEqual(state, stateFromCookie)) {
        throw ApiError.badRequest("Sign-in session mismatch. Please try again.");
      }
      const saved = await OAuthState.findOneAndDelete({ stateHash: hashState(state) }).lean();
      if (!saved || saved.expiresAt.getTime() < Date.now()) {
        throw ApiError.badRequest("Sign-in took too long. Please try again.");
      }
      const profile = await client.exchangeCode({
        callbackUrl,
        state,
        nonce: saved.nonce,
        codeVerifier: saved.codeVerifier,
      });
      const user = await findOrCreateUserByGoogle(profile);
      return { user, returnTo: saved.returnTo };
    },
  };
}
