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

// Environment variables are strings; only the literal "true"/"false" (or "1"/"0") are accepted.
const booleanFlag = z
  .enum(["true", "false", "1", "0"])
  .default("false")
  .transform((value) => value === "true" || value === "1");

const optionalSecret = z
  .string()
  .optional()
  .transform((value) => (value ? value : undefined));

const envSchema = z
  .object({
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
    // Tighter per-IP limit for login endpoints (OTP send/verify, Google start/callback), per 15 minutes.
    AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(30),

    // Public URL of the web app. The browser only ever talks to this origin (the app proxies /api/v1 to
    // this API), so OAuth callbacks and post-login redirects are built from it.
    APP_URL: z.url({ protocol: /^https?$/ }).default("http://localhost:3000"),
    // Keys the HMAC used to hash OTP codes and OAuth state. Long and random; rotating it invalidates
    // pending OTP codes and in-progress Google logins (not existing sessions).
    AUTH_SECRET: z.string().min(32, "must be at least 32 characters (use: openssl rand -base64 32)"),
    SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),

    GOOGLE_CLIENT_ID: optionalSecret,
    GOOGLE_CLIENT_SECRET: optionalSecret,
    MSG91_AUTH_KEY: optionalSecret,
    MSG91_TEMPLATE_ID: optionalSecret,
    // Returns OTP codes in the API response instead of sending an SMS. Local development and tests only.
    OTP_DEV_CODES: booleanFlag,

    // Photo storage. With S3_BUCKET + S3_PUBLIC_URL set, photos go to S3 (served by CloudFront);
    // otherwise they are saved under UPLOAD_DIR and served by this API (development only).
    AWS_REGION: z.string().default("ap-south-1"),
    S3_BUCKET: optionalSecret,
    S3_PUBLIC_URL: z
      .url({ protocol: /^https?$/ })
      .optional()
      .or(z.literal("").transform(() => undefined))
      .transform((url) => url?.replace(/\/$/, "")),
    // Only for S3-compatible stores other than AWS (e.g. MinIO, Cloudflare R2).
    S3_ENDPOINT: z
      .url()
      .optional()
      .or(z.literal("").transform(() => undefined)),
    UPLOAD_DIR: z.string().default(".data/uploads"),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === "production" && env.OTP_DEV_CODES) {
      ctx.addIssue({
        code: "custom",
        path: ["OTP_DEV_CODES"],
        message: "must be false in production (anyone could log in as any phone number)",
      });
    }
    if (Boolean(env.GOOGLE_CLIENT_ID) !== Boolean(env.GOOGLE_CLIENT_SECRET)) {
      ctx.addIssue({
        code: "custom",
        path: ["GOOGLE_CLIENT_SECRET"],
        message: "set both GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET, or neither",
      });
    }
    if (Boolean(env.S3_BUCKET) !== Boolean(env.S3_PUBLIC_URL)) {
      ctx.addIssue({
        code: "custom",
        path: ["S3_PUBLIC_URL"],
        message: "set both S3_BUCKET and S3_PUBLIC_URL, or neither",
      });
    }
    if (env.NODE_ENV === "production" && !env.S3_BUCKET) {
      ctx.addIssue({
        code: "custom",
        path: ["S3_BUCKET"],
        message: "is required in production (local disk storage is lost when a container is replaced)",
      });
    }
    if (Boolean(env.MSG91_AUTH_KEY) !== Boolean(env.MSG91_TEMPLATE_ID)) {
      ctx.addIssue({
        code: "custom",
        path: ["MSG91_TEMPLATE_ID"],
        message: "set both MSG91_AUTH_KEY and MSG91_TEMPLATE_ID, or neither",
      });
    }
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
