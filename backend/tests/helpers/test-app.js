import mongoose from "mongoose";
import pino from "pino";
import { inject } from "vitest";
import { createApp } from "../../src/app.js";
import { connectDatabase } from "../../src/config/database.js";
import { parseEnv } from "../../src/config/env.js";

const silentLogger = pino({ level: "silent" });

/** The web app origin tests pretend to be; browsers send it as `Origin` on POST/PATCH/DELETE. */
export const TEST_APP_URL = "http://localhost:3000";

/**
 * Test configuration. Each test file gets its own database on the shared in-memory server,
 * so files can run in parallel without seeing each other's data.
 *
 * @param {Record<string, string>} [overrides]
 */
export function testEnv(overrides = {}) {
  const base = new URL(inject("mongoUri"));
  base.pathname = `/test_${process.pid}_${Math.random().toString(36).slice(2, 8)}`;
  return parseEnv({
    NODE_ENV: "test",
    MONGODB_URI: base.toString(),
    CORS_ORIGINS: "http://localhost:3000",
    APP_URL: TEST_APP_URL,
    AUTH_SECRET: "test-secret-that-is-at-least-32-characters-long",
    OTP_DEV_CODES: "true",
    // Tests send many login requests from one IP; the login limiter itself is tested with a low value.
    AUTH_RATE_LIMIT_MAX: "10000",
    LOG_LEVEL: "silent",
    ...overrides,
  });
}

/**
 * @param {Record<string, string>} [envOverrides]
 * @param {{ googleClient?: import("../../src/modules/auth/google.client.js").GoogleClient }} [deps]
 */
export function buildTestApp(envOverrides, deps = {}) {
  const env = testEnv(envOverrides);
  return { app: createApp({ env, logger: silentLogger, ...deps }), env, logger: silentLogger };
}

/** @param {string} uri */
export async function connectTestDatabase(uri) {
  await connectDatabase(uri, silentLogger);
}

/** Drops the test file's database so nothing leaks into the next run. */
export async function dropTestDatabase() {
  if (mongoose.connection.readyState === mongoose.ConnectionStates.connected) {
    await mongoose.connection.dropDatabase();
  }
  await mongoose.disconnect();
}
