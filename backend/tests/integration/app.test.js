import request from "supertest";
import { describe, expect, it } from "vitest";
import { buildTestApp } from "../helpers/test-app.js";

const { app } = buildTestApp();

describe("app-wide behaviour", () => {
  it("returns a consistent 404 error for unknown routes", async () => {
    const res = await request(app).get("/api/v1/nope").expect(404);
    expect(res.body).toEqual({
      error: { code: "NOT_FOUND", message: "No route for GET /api/v1/nope.", requestId: expect.any(String) },
    });
  });

  it("generates a request ID and returns it in a header and in errors", async () => {
    const res = await request(app).get("/api/v1/nope");
    expect(res.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.body.error.requestId).toBe(res.headers["x-request-id"]);
  });

  it("keeps a well-formed incoming request ID but replaces a malicious one", async () => {
    const kept = await request(app).get("/api/v1/health/live").set("X-Request-Id", "frontend-req-12345");
    expect(kept.headers["x-request-id"]).toBe("frontend-req-12345");

    const replaced = await request(app)
      .get("/api/v1/health/live")
      .set("X-Request-Id", "<script>alert(1)</script> injected");
    expect(replaced.headers["x-request-id"]).not.toContain("injected");
  });

  it("rejects malformed JSON with 400 INVALID_JSON", async () => {
    const res = await request(app)
      .post("/api/v1/health/live")
      .set("Content-Type", "application/json")
      .send("{ not json");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_JSON");
  });

  it("rejects JSON bodies over 100 KB with 413", async () => {
    const res = await request(app)
      .post("/api/v1/health/live")
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ blob: "x".repeat(110 * 1024) }));
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe("PAYLOAD_TOO_LARGE");
  });

  it("sets security headers and hides the framework", async () => {
    const res = await request(app).get("/api/v1/health/live");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["strict-transport-security"]).toBeDefined();
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });

  it("allows credentialed CORS requests only from configured origins", async () => {
    const allowed = await request(app).get("/api/v1/health/live").set("Origin", "http://localhost:3000");
    expect(allowed.headers["access-control-allow-origin"]).toBe("http://localhost:3000");
    expect(allowed.headers["access-control-allow-credentials"]).toBe("true");

    const blocked = await request(app).get("/api/v1/health/live").set("Origin", "https://evil.example");
    expect(blocked.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("serves the OpenAPI document outside production, listing only real endpoints", async () => {
    const res = await request(app).get("/api/docs.json").expect(200);
    expect(Object.keys(res.body.paths).sort()).toEqual([
      "/api/v1/auth/google/callback",
      "/api/v1/auth/google/start",
      "/api/v1/auth/logout",
      "/api/v1/auth/me",
      "/api/v1/auth/otp/send",
      "/api/v1/auth/otp/verify",
      "/api/v1/health/live",
      "/api/v1/health/ready",
      "/api/v1/media/{file}",
      "/api/v1/products",
      "/api/v1/products/{id}",
      "/api/v1/threads",
      "/api/v1/threads/{id}/like",
      "/api/v1/threads/{id}/replies",
      "/api/v1/uploads",
      "/api/v1/users/me",
    ]);
    expect(res.body.components.schemas.ErrorResponse).toBeDefined();
    expect(res.body.paths["/api/v1/health/live"].get.responses["429"]).toBeDefined();
  });

  it("does not serve API docs in production", async () => {
    const { app: prodApp } = buildTestApp({
      NODE_ENV: "production",
      OTP_DEV_CODES: "false",
      S3_BUCKET: "test-bucket",
      S3_PUBLIC_URL: "https://photos.example.test",
    });
    await request(prodApp).get("/api/docs.json").expect(404);
  });
});

describe("rate limiting", () => {
  it("returns 429 RATE_LIMITED with standard headers once the limit is hit", async () => {
    const { app: limitedApp } = buildTestApp({ RATE_LIMIT_MAX: "2" });
    await request(limitedApp).get("/api/v1/health/live").expect(200);
    await request(limitedApp).get("/api/v1/health/live").expect(200);
    const res = await request(limitedApp).get("/api/v1/health/live").expect(429);
    expect(res.body.error.code).toBe("RATE_LIMITED");
    expect(res.headers["ratelimit-policy"]).toBeDefined();
  });
});
