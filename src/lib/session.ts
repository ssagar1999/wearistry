import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { devMode } from "./env";
import { getUserById, type User } from "./users";

const COOKIE = "wearistry_session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

function secret() {
  const s = process.env.AUTH_SECRET;
  if (s) return s;
  if (process.env.NODE_ENV === "production") throw new Error("AUTH_SECRET is not set");
  return "dev-only-secret-do-not-use-in-production";
}

const sign = (data: string) => createHmac("sha256", secret()).update(data).digest("base64url");

function encode(uid: string) {
  const body = Buffer.from(JSON.stringify({ uid, exp: Date.now() + MAX_AGE * 1000 })).toString("base64url");
  return `${body}.${sign(body)}`;
}

function decode(token: string): string | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const a = Buffer.from(sig), b = Buffer.from(sign(body));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const { uid, exp } = JSON.parse(Buffer.from(body, "base64url").toString());
    return typeof uid === "string" && exp > Date.now() ? uid : null;
  } catch {
    return null;
  }
}

export async function startSession(uid: string) {
  (await cookies()).set(COOKIE, encode(uid), {
    httpOnly: true, sameSite: "lax", secure: !devMode(), // plain http://localhost in local Docker path: "/", maxAge: MAX_AGE,
  });
}

export async function endSession() {
  (await cookies()).delete(COOKIE);
}

export async function currentUser(): Promise<User | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  const uid = token && decode(token);
  return uid ? getUserById(uid) : null;
}
