import { cookies, headers } from "next/headers";

const API_INTERNAL_URL = process.env.API_INTERNAL_URL ?? "http://localhost:4000";

export class ApiNotFoundError extends Error {}

/**
 * GET from the API while rendering on the server. Forwards the visitor's cookies (so per-user fields
 * like `liked` are right) and their IP for rate limiting. Throws on errors; 404 throws ApiNotFoundError.
 */
export async function apiGet<T>(path: string): Promise<T> {
  const [cookieStore, incoming] = await Promise.all([cookies(), headers()]);
  const forwardedFor = incoming.get("x-forwarded-for");
  const res = await fetch(`${API_INTERNAL_URL}/api/v1${path}`, {
    headers: {
      ...(cookieStore.size && { cookie: cookieStore.toString() }),
      ...(forwardedFor && { "x-forwarded-for": forwardedFor }),
    },
    cache: "no-store",
  });
  if (res.status === 404) throw new ApiNotFoundError(path);
  if (!res.ok) throw new Error(`API GET ${path} failed with ${res.status}`);
  return (await res.json()) as T;
}
