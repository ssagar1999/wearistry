import { describe, expect, it } from "vitest";
import { EnvValidationError, parseEnv } from "../../src/config/env.js";

const minimal = { MONGODB_URI: "mongodb://localhost:27017/wearistry" };

describe("parseEnv", () => {
  it("applies safe defaults when only the required variable is set", () => {
    const env = parseEnv(minimal);
    expect(env).toMatchObject({
      NODE_ENV: "development",
      PORT: 4000,
      CORS_ORIGINS: ["http://localhost:3000"],
      LOG_LEVEL: "info",
      TRUST_PROXY_HOPS: 0,
    });
  });

  it("converts numeric strings and splits comma-separated origins", () => {
    const env = parseEnv({
      ...minimal,
      PORT: "8080",
      CORS_ORIGINS: "https://wearistry.in, https://www.wearistry.in",
    });
    expect(env.PORT).toBe(8080);
    expect(env.CORS_ORIGINS).toEqual(["https://wearistry.in", "https://www.wearistry.in"]);
  });

  it("returns a frozen object so config can't be changed at runtime", () => {
    expect(Object.isFrozen(parseEnv(minimal))).toBe(true);
  });

  it("fails when MONGODB_URI is missing", () => {
    expect(() => parseEnv({})).toThrow(EnvValidationError);
  });

  it("lists every problem at once and never echoes the values", () => {
    try {
      parseEnv({ MONGODB_URI: "postgres://secret-password@db", PORT: "99999", CORS_ORIGINS: "not-a-url" });
      expect.unreachable();
    } catch (error) {
      const message = /** @type {EnvValidationError} */ (error).message;
      expect(message).toContain("MONGODB_URI");
      expect(message).toContain("PORT");
      expect(message).toContain("CORS_ORIGINS");
      expect(message).not.toContain("secret-password");
    }
  });

  it("rejects an unknown NODE_ENV", () => {
    expect(() => parseEnv({ ...minimal, NODE_ENV: "staging" })).toThrow(EnvValidationError);
  });
});
