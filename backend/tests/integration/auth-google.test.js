import mongoose from "mongoose";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { OAuthState } from "../../src/modules/auth/oauth-state.model.js";
import { OtpChallenge } from "../../src/modules/auth/otp-challenge.model.js";
import { Session } from "../../src/modules/auth/session.model.js";
import { User } from "../../src/modules/users/user.model.js";
import { createFakeGoogle } from "../helpers/fake-google.js";
import { TEST_APP_URL, buildTestApp, connectTestDatabase, dropTestDatabase } from "../helpers/test-app.js";

const google = createFakeGoogle();
const { app, env } = buildTestApp({}, { googleClient: google });

/** @param {import("supertest").Response} res @param {string} name */
const cookieFrom = (res, name) =>
  /** @type {string[]} */ ([res.headers["set-cookie"] ?? []].flat())
    .find((cookie) => cookie.startsWith(`${name}=`))
    ?.split(";")[0];

/** Runs the browser side of the flow: start → (Google) → callback. */
async function signInWithGoogle(returnTo = "/sell") {
  const start = await request(app)
    .get(`/api/v1/auth/google/start?returnTo=${encodeURIComponent(returnTo)}`)
    .expect(302);
  const state = new URL(start.headers.location).searchParams.get("state");
  const stateCookie = /** @type {string} */ (cookieFrom(start, "wearistry_oauth"));
  const callback = await request(app)
    .get(`/api/v1/auth/google/callback?code=auth-code&state=${state}`)
    .set("Cookie", stateCookie)
    .expect(302);
  return { start, callback, state, stateCookie };
}

beforeAll(() => connectTestDatabase(env.MONGODB_URI));
afterAll(() => dropTestDatabase());
beforeEach(async () => {
  await Promise.all([
    User.deleteMany({}),
    Session.deleteMany({}),
    OAuthState.deleteMany({}),
    OtpChallenge.deleteMany({}),
  ]);
  google.profile = { sub: "google-sub-1", email: "Asha@Example.com", emailVerified: true, name: "Asha Rao" };
});

describe("Google sign-in", () => {
  it("start redirects to Google with our callback URL and sets a short-lived state cookie", async () => {
    const res = await request(app).get("/api/v1/auth/google/start?returnTo=/sell").expect(302);
    const location = new URL(res.headers.location);
    expect(location.searchParams.get("redirect_uri")).toBe(`${TEST_APP_URL}/api/v1/auth/google/callback`);
    const cookie = [res.headers["set-cookie"]].flat().join(";");
    expect(cookie).toMatch(/wearistry_oauth=.+HttpOnly/);
    expect(cookie).toMatch(/Path=\/api\/v1\/auth\/google\/callback/);
    expect(await OAuthState.countDocuments()).toBe(1);
  });

  it("creates the user, starts a session and returns to the requested page", async () => {
    const { callback } = await signInWithGoogle("/sell");
    expect(callback.headers.location).toBe(`${TEST_APP_URL}/sell`);
    expect(cookieFrom(callback, "wearistry_sid")).toBeDefined();

    const user = await User.findOne({ googleSub: "google-sub-1" }).lean();
    expect(user).toMatchObject({ name: "Asha Rao", email: "asha@example.com" });
    expect(user?.phone).toBeUndefined();
    expect(await OAuthState.countDocuments()).toBe(0); // state is single-use

    // PKCE verifier and nonce from start were passed through to the token exchange.
    expect(google.lastExchange).toMatchObject({
      nonce: expect.stringMatching(/^nonce-/),
      codeVerifier: expect.stringMatching(/^verifier-/),
    });
  });

  it("signs in the same user again without overwriting a name they changed", async () => {
    const first = await signInWithGoogle();
    await User.updateOne({ googleSub: "google-sub-1" }, { $set: { name: "Asha R." } });
    google.profile = { ...google.profile, name: "Asha Rao (Google)" };
    await signInWithGoogle();
    expect(await User.countDocuments()).toBe(1);
    expect((await User.findOne().lean())?.name).toBe("Asha R.");
    expect(first.callback.headers.location).toBe(`${TEST_APP_URL}/sell`);
  });

  it("sends new users without a name to the profile step", async () => {
    google.profile = { sub: "google-sub-2", email: "x@example.com", emailVerified: true };
    const { callback } = await signInWithGoogle("/threads");
    expect(callback.headers.location).toBe(`${TEST_APP_URL}/login?step=profile&next=%2Fthreads`);
  });

  it("allows many Google users without phone numbers (partial unique phone index)", async () => {
    await signInWithGoogle();
    google.profile = { sub: "google-sub-3", name: "Ravi" };
    await signInWithGoogle();
    // sanitizeFilter blocks query operators unless the server marks them as trusted.
    expect(await User.countDocuments({ phone: mongoose.trusted({ $exists: false }) })).toBe(2);
  });

  it("ignores an unverified email", async () => {
    google.profile = { sub: "google-sub-4", email: "spoof@example.com", emailVerified: false, name: "Spoof" };
    await signInWithGoogle();
    expect((await User.findOne({ googleSub: "google-sub-4" }).lean())?.email).toBeUndefined();
  });

  it("rejects a callback whose state doesn't match this browser's cookie (login CSRF)", async () => {
    const start = await request(app).get("/api/v1/auth/google/start").expect(302);
    const state = new URL(start.headers.location).searchParams.get("state");
    const res = await request(app)
      .get(`/api/v1/auth/google/callback?code=x&state=${state}`)
      .set("Cookie", "wearistry_oauth=someone-elses-state")
      .expect(302);
    expect(res.headers.location).toBe(`${TEST_APP_URL}/login?error=google_failed`);
    expect(cookieFrom(res, "wearistry_sid")).toBeUndefined();

    await request(app).get(`/api/v1/auth/google/callback?code=x&state=${state}`).expect(302); // no cookie at all
    expect(await Session.countDocuments()).toBe(0);
  });

  it("rejects a replayed or expired state", async () => {
    const { state, stateCookie } = await signInWithGoogle();
    const replay = await request(app)
      .get(`/api/v1/auth/google/callback?code=x&state=${state}`)
      .set("Cookie", stateCookie);
    expect(replay.headers.location).toBe(`${TEST_APP_URL}/login?error=google_failed`);

    const start = await request(app).get("/api/v1/auth/google/start").expect(302);
    await OAuthState.updateMany({}, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    const expiredState = new URL(start.headers.location).searchParams.get("state");
    const expired = await request(app)
      .get(`/api/v1/auth/google/callback?code=x&state=${expiredState}`)
      .set("Cookie", /** @type {string} */ (cookieFrom(start, "wearistry_oauth")));
    expect(expired.headers.location).toBe(`${TEST_APP_URL}/login?error=google_failed`);
  });

  it("redirects to the login page when Google rejects the code or the user cancels", async () => {
    google.failNextExchange = true;
    const { callback } = await signInWithGoogle();
    expect(callback.headers.location).toBe(`${TEST_APP_URL}/login?error=google_failed`);

    const cancelled = await request(app).get("/api/v1/auth/google/callback?error=access_denied").expect(302);
    expect(cancelled.headers.location).toBe(`${TEST_APP_URL}/login?error=google_cancelled`);
  });

  it("never redirects off-site after login (open-redirect protection)", async () => {
    for (const evil of ["//evil.example", "https://evil.example", "/\\evil.example"]) {
      await User.deleteMany({});
      const { callback } = await signInWithGoogle(evil);
      expect(callback.headers.location).toBe(`${TEST_APP_URL}/`);
    }
  });

  it("returns 503 from start when Google isn't configured", async () => {
    const { app: noGoogle } = buildTestApp();
    const res = await request(noGoogle).get("/api/v1/auth/google/start").expect(503);
    expect(res.body.error.code).toBe("SERVICE_UNAVAILABLE");
  });
});

describe("adding a verified phone to a Google account", () => {
  async function googleSession() {
    const { callback } = await signInWithGoogle();
    return /** @type {string} */ (cookieFrom(callback, "wearistry_sid"));
  }
  /** @param {string} phone */
  async function devCode(phone) {
    const res = await request(app)
      .post("/api/v1/auth/otp/send")
      .set("Origin", TEST_APP_URL)
      .send({ phone })
      .expect(200);
    return res.body.data.devCode;
  }

  it("attaches the phone to the logged-in account instead of creating a new one", async () => {
    const cookie = await googleSession();
    const res = await request(app)
      .post("/api/v1/auth/otp/verify")
      .set("Origin", TEST_APP_URL)
      .set("Cookie", cookie)
      .send({ phone: "9876501234", code: await devCode("9876501234") })
      .expect(200);
    expect(res.body.data.user).toMatchObject({ phone: "9876501234", phoneVerified: true, name: "Asha Rao" });
    expect(await User.countDocuments()).toBe(1);
  });

  it("refuses a phone that already belongs to another account", async () => {
    const phone = "9876505678";
    await request(app)
      .post("/api/v1/auth/otp/verify")
      .set("Origin", TEST_APP_URL)
      .send({ phone, code: await devCode(phone) })
      .expect(200);
    await OtpChallenge.deleteMany({});

    const cookie = await googleSession();
    const res = await request(app)
      .post("/api/v1/auth/otp/verify")
      .set("Origin", TEST_APP_URL)
      .set("Cookie", cookie)
      .send({ phone, code: await devCode(phone) })
      .expect(409);
    expect(res.body.error.message).toMatch(/already linked/);
  });
});
