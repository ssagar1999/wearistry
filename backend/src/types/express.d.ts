import "express-serve-static-core";

declare module "express-serve-static-core" {
  interface Request {
    /** Unique ID for tracing this request through logs; also returned in the X-Request-Id header. */
    id: string;
    /** The logged-in user, set by `loadSession`; undefined for anonymous requests. */
    user?: import("../modules/users/user.service.js").PublicUser;
    /** Parsed, validated request input set by the `validate` middleware. */
    validated?: {
      body?: unknown;
      query?: unknown;
      params?: unknown;
    };
  }
}
