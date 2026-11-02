import { z } from "zod";

const LOG_LEVELS = ["fatal", "error", "warn", "info", "debug", "trace", "silent"];

const commaSeparatedOrigins = z
  .string()
  .transform((value) =>
    value
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
  )
  .pipe(z.array(z.url({ protocol: /^https?$/ })).min(1));

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  MONGODB_URI: z.string().regex(/^mongodb(\+srv)?:\/\//, "must start with mongodb:// or mongodb+srv://"),
  CORS_ORIGINS: commaSeparatedOrigins.default(["http://localhost:3000"]),
  LOG_LEVEL: z.enum(LOG_LEVELS).default("info"),
  // Number of reverse proxies in front of the API (e.g. 1 for the Next.js proxy or a load balancer).
  // Express needs this to read the real client IP for rate limiting; trusting too many hops lets clients spoof it.
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(120),
});

/** @typedef {z.infer<typeof envSchema>} Env */

export class EnvValidationError extends Error {
  /** @param {string[]} problems */
  constructor(problems) {
    super(`Invalid environment configuration:\n  - ${problems.join("\n  - ")}`);
    this.name = "EnvValidationError";
    this.problems = problems;
  }
}

/**
 * Validates environment variables once at startup so the app fails fast with a clear message
 * instead of misbehaving later. Values are never included in errors, because they may be secrets.
 *
 * @param {Record<string, string | undefined>} source
 * @returns {Readonly<Env>}
 */
export function parseEnv(source) {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    throw new EnvValidationError(
      result.error.issues.map((issue) => `${issue.path.join(".") || "env"}: ${issue.message}`),
    );
  }
  return Object.freeze(result.data);
}
