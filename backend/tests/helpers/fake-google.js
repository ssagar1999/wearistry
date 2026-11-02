/**
 * Stands in for Google in tests. `exchangeCode` returns whichever profile the test sets, and records the
 * values it was called with so tests can check that state, nonce and PKCE verifier were passed through.
 *
 * @returns {import("../../src/modules/auth/google.client.js").GoogleClient & {
 *   profile: { sub: string, email?: string, emailVerified?: boolean, name?: string, picture?: string },
 *   lastExchange?: { state: string, nonce: string, codeVerifier: string, callbackUrl: URL },
 *   failNextExchange: boolean,
 * }}
 */
export function createFakeGoogle() {
  let counter = 0;
  /** @type {ReturnType<typeof createFakeGoogle>} */
  const fake = {
    profile: { sub: "google-sub-1", email: "asha@example.com", emailVerified: true, name: "Asha Rao" },
    lastExchange: undefined,
    failNextExchange: false,
    newLoginSecrets() {
      counter += 1;
      return {
        state: `state-${counter}-abcdefgh`,
        nonce: `nonce-${counter}`,
        codeVerifier: `verifier-${counter}`,
      };
    },
    async authorizationUrl({ redirectUri, state }) {
      return `https://accounts.google.test/auth?redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;
    },
    async exchangeCode(params) {
      fake.lastExchange = params;
      if (fake.failNextExchange) {
        fake.failNextExchange = false;
        throw new Error("invalid_grant");
      }
      return fake.profile;
    },
  };
  return fake;
}
