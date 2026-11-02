import mongoose from "mongoose";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { OtpChallenge } from "../../src/modules/auth/otp-challenge.model.js";
import { Session } from "../../src/modules/auth/session.model.js";
import { User } from "../../src/modules/users/user.model.js";
import { TEST_APP_URL, buildTestApp, connectTestDatabase, dropTestDatabase } from "../helpers/test-app.js";

const { app, env } = buildTestApp();
const PHONE = "9876543210";

/** POST as the web app would send it (browsers always include Origin on POST). */
const post = (/** @type {string} */ path) => request(app).post(path).set("Origin", TEST_APP_URL);

/** @param {string} phone */
async function sendCode(phone) {
  const res = await post("/api/v1/auth/otp/send").send({ phone }).expect(200);
  return /** @type {string} */ (res.body.data.devCode);
}

/** Lets the next send skip the 30-second wait without sleeping in tests. */
async function rewindLastSend(/** @type {string} */ phone) {
  await OtpChallenge.updateOne({ phone }, { $set: { lastSentAt: new Date(Date.now() - 31_000) } });
}

/** @param {import("supertest").Response} res */
const sessionCookie = (res) =>
  /** @type {string[]} */ ([res.headers["set-cookie"]].flat()).find((c) => c.startsWith("wearistry_sid="));

beforeAll(() => connectTestDatabase(env.MONGODB_URI));
afterAll(() => dropTestDatabase());
beforeEach(async () => {
  await Promise.all([OtpChallenge.deleteMany({}), Session.deleteMany({}), User.deleteMany({})]);
});

describe("POST /api/v1/auth/otp/send", () => {
  it("sends a code and accepts common Indian number formats", async () => {
    const res = await post("/api/v1/auth/otp/send").send({ phone: "+91 98765-43210" }).expect(200);
    expect(res.body.data).toEqual({ sent: true, devCode: expect.stringMatching(/^\d{6}$/) });
    const stored = await OtpChallenge.findOne({ phone: PHONE }).lean();
    expect(stored?.codeHash).toBeDefined();
    expect(stored?.codeHash).not.toContain(res.body.data.devCode); // only a hash is stored
  });

  it("rejects invalid and non-Indian numbers, and unexpected fields", async () => {
    for (const phone of ["12345", "5876543210", "+1 415 555 0100"]) {
      const res = await post("/api/v1/auth/otp/send").send({ phone }).expect(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    }
    await post("/api/v1/auth/otp/send").send({ phone: PHONE, extra: 1 }).expect(400);
    await post("/api/v1/auth/otp/send")
      .send({ phone: { $gt: "" } })
      .expect(400);
  });

  it("requires a 30-second gap between codes and reports how long to wait", async () => {
    await sendCode(PHONE);
    const res = await post("/api/v1/auth/otp/send").send({ phone: PHONE }).expect(429);
    expect(res.body.error.code).toBe("RATE_LIMITED");
    expect(res.body.error.details.retryAfterSeconds).toBeGreaterThan(25);
  });

  it("allows at most 5 codes per hour per phone", async () => {
    for (let i = 0; i < 5; i += 1) {
      await sendCode(PHONE);
      await rewindLastSend(PHONE);
    }
    const res = await post("/api/v1/auth/otp/send").send({ phone: PHONE }).expect(429);
    expect(res.body.error.message).toMatch(/Too many codes/);
  });

  it("starts a new hourly window once the old one has passed", async () => {
    for (let i = 0; i < 5; i += 1) {
      await sendCode(PHONE);
      await rewindLastSend(PHONE);
    }
    await OtpChallenge.updateOne(
      { phone: PHONE },
      { $set: { windowStartedAt: new Date(Date.now() - 61 * 60_000) } },
    );
    await sendCode(PHONE);
    expect((await OtpChallenge.findOne({ phone: PHONE }).lean())?.sendsInWindow).toBe(1);
  });

  it("lets only one of many simultaneous requests through (atomic limit)", async () => {
    const results = await Promise.all(
      Array.from({ length: 8 }, () => post("/api/v1/auth/otp/send").send({ phone: PHONE })),
    );
    expect(results.filter((res) => res.status === 200)).toHaveLength(1);
    expect(results.filter((res) => res.status === 429)).toHaveLength(7);
  });

  it("is rejected without the web app's Origin (CSRF protection)", async () => {
    await request(app).post("/api/v1/auth/otp/send").send({ phone: PHONE }).expect(403);
    await request(app)
      .post("/api/v1/auth/otp/send")
      .set("Origin", "https://evil.example")
      .send({ phone: PHONE })
      .expect(403);
  });
});

describe("POST /api/v1/auth/otp/verify", () => {
  it("creates the user on first login, sets a secure session cookie, and asks for a profile", async () => {
    const code = await sendCode(PHONE);
    const res = await post("/api/v1/auth/otp/verify").send({ phone: PHONE, code }).expect(200);

    expect(res.body.data).toEqual({
      user: {
        id: expect.any(String),
        name: "",
        city: "",
        phone: PHONE,
        phoneVerified: true,
        email: null,
        avatarUrl: null,
      },
      needsProfile: true,
    });
    const cookie = sessionCookie(res);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Lax/);
    expect(cookie).toMatch(/Path=\//);
    expect(await User.countDocuments({ phone: PHONE })).toBe(1);
  });

  it("logs the same user in again without creating a duplicate", async () => {
    const first = await post("/api/v1/auth/otp/verify").send({ phone: PHONE, code: await sendCode(PHONE) });
    await rewindLastSend(PHONE);
    const second = await post("/api/v1/auth/otp/verify").send({ phone: PHONE, code: await sendCode(PHONE) });
    expect(second.body.data.user.id).toBe(first.body.data.user.id);
    expect(await User.countDocuments({ phone: PHONE })).toBe(1);
  });

  it("rejects a wrong code, then locks the code after 5 tries", async () => {
    const code = await sendCode(PHONE);
    const wrong = code === "000000" ? "111111" : "000000";
    for (let i = 0; i < 5; i += 1) {
      const res = await post("/api/v1/auth/otp/verify").send({ phone: PHONE, code: wrong }).expect(401);
      expect(res.body.error.code).toBe("UNAUTHENTICATED");
    }
    const locked = await post("/api/v1/auth/otp/verify").send({ phone: PHONE, code }).expect(401);
    expect(locked.body.error.message).toMatch(/too many wrong tries/);
  });

  it("rejects an expired code", async () => {
    const code = await sendCode(PHONE);
    await OtpChallenge.updateOne({ phone: PHONE }, { $set: { codeExpiresAt: new Date(Date.now() - 1000) } });
    await post("/api/v1/auth/otp/verify").send({ phone: PHONE, code }).expect(401);
  });

  it("accepts a code only once, even when submitted twice at the same time", async () => {
    const code = await sendCode(PHONE);
    const [a, b] = await Promise.all([
      post("/api/v1/auth/otp/verify").send({ phone: PHONE, code }),
      post("/api/v1/auth/otp/verify").send({ phone: PHONE, code }),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 401]);
    await post("/api/v1/auth/otp/verify").send({ phone: PHONE, code }).expect(401);
  });

  it("rejects malformed codes and a code for a phone that never requested one", async () => {
    await post("/api/v1/auth/otp/verify").send({ phone: PHONE, code: "12ab56" }).expect(400);
    await post("/api/v1/auth/otp/verify").send({ phone: PHONE, code: "123456" }).expect(401);
  });
});

describe("session lifecycle", () => {
  /** @returns {Promise<string>} the session cookie */
  async function login() {
    const res = await post("/api/v1/auth/otp/verify").send({ phone: PHONE, code: await sendCode(PHONE) });
    return /** @type {string} */ (sessionCookie(res)).split(";")[0];
  }

  it("GET /auth/me returns the user with a session and 401 without one", async () => {
    const cookie = await login();
    const me = await request(app).get("/api/v1/auth/me").set("Cookie", cookie).expect(200);
    expect(me.body.data.user.phone).toBe(PHONE);

    const anonymous = await request(app).get("/api/v1/auth/me").expect(401);
    expect(anonymous.body.error.code).toBe("UNAUTHENTICATED");
    await request(app).get("/api/v1/auth/me").set("Cookie", "wearistry_sid=made-up-token").expect(401);
  });

  it("stores only a hash of the session token", async () => {
    const cookie = await login();
    const token = cookie.split("=")[1];
    const session = await Session.findOne().lean();
    expect(session?.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(session?.tokenHash).not.toBe(token);
  });

  it("rejects an expired session even before MongoDB's TTL cleanup removes it", async () => {
    const cookie = await login();
    await Session.updateMany({}, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    await request(app).get("/api/v1/auth/me").set("Cookie", cookie).expect(401);
  });

  it("logout deletes the session and clears the cookie", async () => {
    const cookie = await login();
    const res = await post("/api/v1/auth/logout").set("Cookie", cookie).expect(204);
    expect(String(res.headers["set-cookie"])).toMatch(/wearistry_sid=;/);
    expect(await Session.countDocuments()).toBe(0);
    await request(app).get("/api/v1/auth/me").set("Cookie", cookie).expect(401);
  });

  it("PATCH /users/me updates the profile, validates input, and requires login", async () => {
    const cookie = await login();
    const res = await request(app)
      .patch("/api/v1/users/me")
      .set("Origin", TEST_APP_URL)
      .set("Cookie", cookie)
      .send({ name: "  Priya Sharma ", city: "Pune" })
      .expect(200);
    expect(res.body.data.user).toMatchObject({ name: "Priya Sharma", city: "Pune" });

    await request(app)
      .patch("/api/v1/users/me")
      .set("Origin", TEST_APP_URL)
      .set("Cookie", cookie)
      .send({ name: "P" })
      .expect(400);
    await request(app)
      .patch("/api/v1/users/me")
      .set("Origin", TEST_APP_URL)
      .set("Cookie", cookie)
      .send({ name: "Priya", uid: "x" })
      .expect(400);
    await request(app)
      .patch("/api/v1/users/me")
      .set("Origin", TEST_APP_URL)
      .send({ name: "Priya" })
      .expect(401);
    // A logged-in request from another site is refused even with a valid cookie.
    await request(app)
      .patch("/api/v1/users/me")
      .set("Origin", "https://evil.example")
      .set("Cookie", cookie)
      .send({ name: "Hacked" })
      .expect(403);
  });
});

describe("SMS delivery (MSG91)", () => {
  const smsApp = buildTestApp({
    OTP_DEV_CODES: "false",
    MSG91_AUTH_KEY: "key",
    MSG91_TEMPLATE_ID: "tmpl",
  }).app;
  const smsPost = () => request(smsApp).post("/api/v1/auth/otp/send").set("Origin", TEST_APP_URL);

  it("sends through MSG91 and never returns the code", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ type: "success" }));
    const res = await smsPost().send({ phone: PHONE }).expect(200);
    expect(res.body.data).toEqual({ sent: true });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("mobile=919876543210");
    expect(init?.headers).toMatchObject({ authkey: "key" });
  });

  it("returns 503 when MSG91 reports an error, even with HTTP 200", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({ type: "error", message: "bad template" }),
    );
    const res = await smsPost().send({ phone: "9123456780" }).expect(503);
    expect(res.body.error.code).toBe("SERVICE_UNAVAILABLE");
    expect(JSON.stringify(res.body)).not.toContain("bad template");
  });

  it("returns 503 when SMS isn't configured and dev codes are off", async () => {
    const { app: unconfigured } = buildTestApp({ OTP_DEV_CODES: "false" });
    await request(unconfigured)
      .post("/api/v1/auth/otp/send")
      .set("Origin", TEST_APP_URL)
      .send({ phone: "9000000002" })
      .expect(503);
  });
});

describe("login rate limit", () => {
  it("limits login requests per IP more tightly than the rest of the API", async () => {
    const { app: strictApp } = buildTestApp({ AUTH_RATE_LIMIT_MAX: "2" });
    const send = (/** @type {string} */ phone) =>
      request(strictApp).post("/api/v1/auth/otp/send").set("Origin", TEST_APP_URL).send({ phone });
    await send("9000000011").expect(200);
    await send("9000000012").expect(200);
    const res = await send("9000000013").expect(429);
    expect(res.body.error.code).toBe("RATE_LIMITED");
    // Other endpoints still work for this IP.
    await request(strictApp).get("/api/v1/health/live").expect(200);
  });
});

describe("database failure", () => {
  it("returns a safe 500 when MongoDB is down", async () => {
    await mongoose.disconnect();
    const res = await post("/api/v1/auth/otp/send").send({ phone: PHONE });
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe("INTERNAL_ERROR");
    await connectTestDatabase(env.MONGODB_URI);
  });
});
