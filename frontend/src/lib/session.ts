import { cookies, headers } from "next/headers";

/** The logged-in user as returned by the API's GET /api/v1/auth/me. */
export type User = {
  id: string;
  name: string;
  city: string;
  phone: string | null;
  phoneVerified: boolean;
  email: string | null;
  avatarUrl: string | null;
};

const API_INTERNAL_URL = process.env.API_INTERNAL_URL ?? "http://localhost:4000";

/**
 * Asks the API who is logged in, forwarding the browser's cookies. Sessions live in the API;
 * this app never reads or creates them itself.
 */
export async function currentUser(): Promise<User | null> {
  const cookieHeader = (await cookies()).toString();
  if (!cookieHeader.includes("wearistry_sid=")) return null;

  const incoming = await headers();
  const res = await fetch(`${API_INTERNAL_URL}/api/v1/auth/me`, {
    headers: {
      cookie: cookieHeader,
      // Lets the API rate-limit and log by the real visitor rather than by this server.
      ...(incoming.get("x-forwarded-for") && { "x-forwarded-for": incoming.get("x-forwarded-for")! }),
    },
    cache: "no-store",
  });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`Auth check failed: API responded ${res.status}`);
  return ((await res.json()) as { data: { user: User } }).data.user;
}
