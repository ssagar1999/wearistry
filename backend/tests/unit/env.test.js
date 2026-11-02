import { describe, expect, it } from "vitest";
import { EnvValidationError, parseEnv } from "../../src/config/env.js";

const minimal = {
  MONGODB_URI: "mongodb://localhost:27017/wearistry",
  AUTH_SECRET: "a-test-secret-that-is-at-least-32-chars",
};

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

  it("requires a long AUTH_SECRET", () => {
    expect(() => parseEnv({ ...minimal, AUTH_SECRET: "short" })).toThrow(/AUTH_SECRET/);
  });

  it("parses boolean flags strictly", () => {
    expect(parseEnv({ ...minimal, OTP_DEV_CODES: "true" }).OTP_DEV_CODES).toBe(true);
    expect(parseEnv(minimal).OTP_DEV_CODES).toBe(false);
    expect(() => parseEnv({ ...minimal, OTP_DEV_CODES: "yes" })).toThrow(EnvValidationError);
  });

  it("refuses OTP_DEV_CODES in production", () => {
    expect(() => parseEnv({ ...minimal, NODE_ENV: "production", OTP_DEV_CODES: "true" })).toThrow(
      /OTP_DEV_CODES/,
    );
  });

  it("requires provider keys in pairs and treats empty values as unset", () => {
    expect(() => parseEnv({ ...minimal, GOOGLE_CLIENT_ID: "id" })).toThrow(/GOOGLE_CLIENT_SECRET/);
    expect(() => parseEnv({ ...minimal, MSG91_AUTH_KEY: "key" })).toThrow(/MSG91_TEMPLATE_ID/);
    expect(
      parseEnv({ ...minimal, GOOGLE_CLIENT_ID: "", GOOGLE_CLIENT_SECRET: "" }).GOOGLE_CLIENT_ID,
    ).toBeUndefined();
  });

  it("leaves LOG_PRETTY unset unless given, and parses it strictly", () => {
    expect(parseEnv(minimal).LOG_PRETTY).toBeUndefined();
    expect(parseEnv({ ...minimal, LOG_PRETTY: "false" }).LOG_PRETTY).toBe(false);
    expect(() => parseEnv({ ...minimal, LOG_PRETTY: "maybe" })).toThrow(EnvValidationError);
  });

  it("rejects an unknown NODE_ENV", () => {
    expect(() => parseEnv({ ...minimal, NODE_ENV: "staging" })).toThrow(EnvValidationError);
  });
});
