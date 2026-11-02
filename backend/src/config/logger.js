import pino from "pino";

/** @typedef {import("./env.js").Env} Env */

// Anything that can authenticate a user or reveal a secret is removed before a log line is written.
export const REDACTED_PATHS = [
  "req.headers.cookie",
  "req.headers.authorization",
  'res.headers["set-cookie"]',
  "*.password",
  "*.passwordHash",
  "*.token",
  "*.accessToken",
  "*.refreshToken",
  "*.idToken",
  "*.otp",
];

/**
 * @param {Pick<Env, "NODE_ENV" | "LOG_LEVEL" | "LOG_PRETTY">} env
 * @returns {import("pino").Logger}
 */
export function createLogger(env) {
  return pino({
    level: env.LOG_LEVEL,
    base: { service: "wearistry-api" },
    redact: { paths: REDACTED_PATHS, censor: "[redacted]" },
    // Human-readable output while developing; one JSON object per line elsewhere, for log tools.
    transport:
      (env.LOG_PRETTY ?? env.NODE_ENV === "development")
        ? { target: "pino-pretty", options: { translateTime: "HH:MM:ss", ignore: "pid,hostname,service" } }
        : undefined,
  });
}
