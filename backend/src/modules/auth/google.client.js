import * as oidc from "openid-client";

const GOOGLE_ISSUER = new URL("https://accounts.google.com");

/**
 * Thin wrapper around openid-client so the rest of the code (and tests) don't depend on its API.
 * openid-client handles the security-critical parts: PKCE, state and nonce checks, and ID-token validation.
 *
 * @param {{ clientId: string, clientSecret: string }} credentials
 */
export function createGoogleClient({ clientId, clientSecret }) {
  /** @type {Promise<oidc.Configuration> | undefined} */
  let config;
  // Google's OpenID configuration is fetched once and reused; a failed fetch is retried on the next login.
  const getConfig = () =>
    (config ??= oidc.discovery(GOOGLE_ISSUER, clientId, clientSecret).catch((error) => {
      config = undefined;
      throw error;
    }));

  return {
    newLoginSecrets() {
      return {
        state: oidc.randomState(),
        nonce: oidc.randomNonce(),
        codeVerifier: oidc.randomPKCECodeVerifier(),
      };
    },

    /** @param {{ redirectUri: string, state: string, nonce: string, codeVerifier: string }} params */
    async authorizationUrl({ redirectUri, state, nonce, codeVerifier }) {
      return oidc
        .buildAuthorizationUrl(await getConfig(), {
          redirect_uri: redirectUri,
          scope: "openid email profile",
          state,
          nonce,
          code_challenge: await oidc.calculatePKCECodeChallenge(codeVerifier),
          code_challenge_method: "S256",
          prompt: "select_account",
        })
        .toString();
    },

    /**
     * @param {{ callbackUrl: URL, state: string, nonce: string, codeVerifier: string }} params
     * @returns {Promise<{ sub: string, email?: string, emailVerified?: boolean, name?: string, picture?: string }>}
     */
    async exchangeCode({ callbackUrl, state, nonce, codeVerifier }) {
      const tokens = await oidc.authorizationCodeGrant(await getConfig(), callbackUrl, {
        pkceCodeVerifier: codeVerifier,
        expectedState: state,
        expectedNonce: nonce,
        idTokenExpected: true,
      });
      const claims = tokens.claims();
      if (!claims) throw new Error("Google did not return an ID token");
      return {
        sub: claims.sub,
        email: typeof claims.email === "string" ? claims.email : undefined,
        emailVerified: claims.email_verified === true,
        name: typeof claims.name === "string" ? claims.name : undefined,
        picture: typeof claims.picture === "string" ? claims.picture : undefined,
      };
    },
  };
}

/** @typedef {ReturnType<typeof createGoogleClient>} GoogleClient */
