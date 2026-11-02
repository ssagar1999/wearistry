import { z } from "zod";
import { ErrorResponse, rateLimitedResponse } from "../../docs/common.js";
import { PublicUser } from "../users/user.schemas.js";
import { sendOtpBody, verifyOtpBody } from "./auth.schemas.js";
import { SESSION_COOKIE } from "./session.service.js";

const json = (/** @type {z.ZodType} */ schema) => ({ "application/json": { schema } });
const error = (/** @type {string} */ description) => ({ description, content: json(ErrorResponse) });
const authResult = z.object({ data: z.object({ user: PublicUser, needsProfile: z.boolean() }) });

/** @param {import("@asteasolutions/zod-to-openapi").OpenAPIRegistry} registry */
export function registerAuthDocs(registry) {
  registry.registerComponent("securitySchemes", "sessionCookie", {
    type: "apiKey",
    in: "cookie",
    name: SESSION_COOKIE,
    description: "httpOnly session cookie set by OTP verify or Google sign-in.",
  });

  registry.registerPath({
    method: "post",
    path: "/api/v1/auth/otp/send",
    tags: ["Auth"],
    summary: "Send a 6-digit login code by SMS",
    description:
      "Per phone: one code every 30 s, 5 per hour. `devCode` is returned only when OTP_DEV_CODES is on.",
    request: { body: { content: json(sendOtpBody) } },
    responses: {
      200: {
        description: "Code sent",
        content: json(
          z.object({ data: z.object({ sent: z.literal(true), devCode: z.string().optional() }) }),
        ),
      },
      400: error("Invalid phone number"),
      403: error("Request not from the Wearistry web app (Origin check)"),
      429: {
        ...rateLimitedResponse,
        description: "Too many codes or requests; `details.retryAfterSeconds` when known",
      },
      503: error("SMS provider unavailable"),
    },
  });

  registry.registerPath({
    method: "post",
    path: "/api/v1/auth/otp/verify",
    tags: ["Auth"],
    summary: "Log in with a code (or add a verified phone to the logged-in account)",
    request: { body: { content: json(verifyOtpBody) } },
    responses: {
      200: { description: `Logged in; sets the ${SESSION_COOKIE} cookie`, content: json(authResult) },
      400: error("Invalid input"),
      401: error("Wrong, expired or used code"),
      403: error("Request not from the Wearistry web app"),
      409: error("Phone already linked to another account"),
      429: rateLimitedResponse,
    },
  });

  registry.registerPath({
    method: "get",
    path: "/api/v1/auth/google/start",
    tags: ["Auth"],
    summary: "Start Google sign-in (browser navigation)",
    request: { query: z.object({ returnTo: z.string().optional().meta({ example: "/sell" }) }) },
    responses: {
      302: { description: "Redirect to Google" },
      429: rateLimitedResponse,
      503: error("Google sign-in not configured"),
    },
  });

  registry.registerPath({
    method: "get",
    path: "/api/v1/auth/google/callback",
    tags: ["Auth"],
    summary: "Google redirects here; sets the session cookie and redirects into the app",
    responses: { 302: { description: "Redirect to `returnTo`, or to /login?error=… on failure" } },
  });

  registry.registerPath({
    method: "get",
    path: "/api/v1/auth/me",
    tags: ["Auth"],
    summary: "The logged-in user",
    security: [{ sessionCookie: [] }],
    responses: {
      200: { description: "Logged in", content: json(z.object({ data: z.object({ user: PublicUser }) })) },
      401: error("Not logged in"),
      429: rateLimitedResponse,
    },
  });

  registry.registerPath({
    method: "post",
    path: "/api/v1/auth/logout",
    tags: ["Auth"],
    summary: "Log out this browser",
    responses: {
      204: { description: "Logged out; cookie cleared" },
      403: error("Request not from the Wearistry web app"),
    },
  });
}
