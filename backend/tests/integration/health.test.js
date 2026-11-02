import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { disconnectDatabase } from "../../src/config/database.js";
import { buildTestApp, connectTestDatabase, dropTestDatabase } from "../helpers/test-app.js";

const { app, env } = buildTestApp();

describe("health endpoints", () => {
  beforeAll(() => connectTestDatabase(env.MONGODB_URI));
  afterAll(() => dropTestDatabase());

  it("GET /api/v1/health/live reports the process is up", async () => {
    const res = await request(app).get("/api/v1/health/live").expect(200);
    expect(res.body.data).toEqual({ status: "ok", uptimeSeconds: expect.any(Number) });
  });

  it("GET /api/v1/health/ready is 200 while the database is connected", async () => {
    const res = await request(app).get("/api/v1/health/ready").expect(200);
    expect(res.body.data).toEqual({ status: "ok", checks: { database: "up" } });
  });

  it("GET /api/v1/health/ready is 503 when the database connection is lost", async () => {
    await disconnectDatabase();
    const res = await request(app).get("/api/v1/health/ready").expect(503);
    expect(res.body.data).toEqual({ status: "unavailable", checks: { database: "down" } });
    // Liveness stays healthy: a DB outage should take the instance out of rotation, not restart it.
    await request(app).get("/api/v1/health/live").expect(200);
    await connectTestDatabase(env.MONGODB_URI);
  });
});
