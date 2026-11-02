import { createHmac, randomInt, timingSafeEqual } from "crypto";
import { devMode } from "./env";

const TTL = 5 * 60_000; // code valid for 5 minutes
const RESEND_AFTER = 30_000;
const MAX_SENDS_PER_HOUR = 5;
const MAX_ATTEMPTS = 5;

type Entry = { hash: string; expires: number; attempts: number; sends: number[] };
// Single-server store. Move to Redis (with TTL) before running more than one instance.
const g = globalThis as unknown as { _otp?: Map<string, Entry> };
const store = (g._otp ??= new Map<string, Entry>());

const hash = (phone: string, code: string) =>
  createHmac("sha256", process.env.AUTH_SECRET ?? "dev-only-secret-do-not-use-in-production").update(`${phone}:${code}`).digest("hex");

export const isDevOtp = () => !(process.env.MSG91_AUTH_KEY && process.env.MSG91_TEMPLATE_ID) && devMode();

async function deliver(phone: string, code: string) {
  const key = process.env.MSG91_AUTH_KEY, template = process.env.MSG91_TEMPLATE_ID;
  if (!key || !template) {
    if (!devMode()) throw new Error("SMS provider is not configured");
    console.log(`[dev] OTP for +91${phone}: ${code}`);
    return;
  }
  // MSG91 SendOTP v5. We pass our own code and verify it ourselves; MSG91 only delivers the SMS.
  const qs = new URLSearchParams({
    template_id: template, mobile: `91${phone}`, otp: code, otp_length: "6", otp_expiry: String(TTL / 60_000), realTimeResponse: "1",
  });
  const res = await fetch(`https://control.msg91.com/api/v5/otp?${qs}`, {
    method: "POST",
    headers: { authkey: key, "content-type": "application/json" },
    body: "{}",
    signal: AbortSignal.timeout(10_000),
  });
  // Errors such as a bad template ID can come back as HTTP 200, so check the body too.
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.type !== "success") throw new Error(`MSG91 send failed (${res.status}): ${body.message ?? JSON.stringify(body)}`);
}

export type SendResult = { ok: true; devCode?: string } | { ok: false; error: string; retryIn?: number };

export async function sendOtp(phone: string): Promise<SendResult> {
  const now = Date.now();
  const prev = store.get(phone);
  const sends = (prev?.sends ?? []).filter((t) => now - t < 3600_000);
  const last = sends.at(-1);
  if (last && now - last < RESEND_AFTER) return { ok: false, error: "Please wait before asking for another code.", retryIn: Math.ceil((RESEND_AFTER - (now - last)) / 1000) };
  if (sends.length >= MAX_SENDS_PER_HOUR) return { ok: false, error: "Too many codes requested. Try again in an hour." };

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await deliver(phone, code);
  store.set(phone, { hash: hash(phone, code), expires: now + TTL, attempts: 0, sends: [...sends, now] });
  return { ok: true, ...(isDevOtp() && { devCode: code }) };
}

export function verifyOtp(phone: string, code: string): { ok: true } | { ok: false; error: string } {
  const e = store.get(phone);
  if (!e || e.expires < Date.now()) return { ok: false, error: "That code has expired. Send a new one." };
  if (e.attempts >= MAX_ATTEMPTS) return { ok: false, error: "Too many wrong tries. Send a new code." };
  e.attempts++;
  const a = Buffer.from(e.hash), b = Buffer.from(hash(phone, code));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, error: "That code isn’t right. Check the SMS and try again." };
  store.set(phone, { ...e, hash: "", expires: 0 }); // one-time use, keep send history for rate limits
  return { ok: true };
}
