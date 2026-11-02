import { NextResponse } from "next/server";
import { normalizePhone } from "@/lib/phone";
import { verifyOtp } from "@/lib/otp";
import { findOrCreateUser } from "@/lib/users";
import { startSession } from "@/lib/session";

export async function POST(req: Request) {
  const { phone, code } = await req.json().catch(() => ({}));
  const p = typeof phone === "string" ? normalizePhone(phone) : null;
  if (!p || typeof code !== "string" || !/^\d{6}$/.test(code))
    return NextResponse.json({ error: "Enter the 6-digit code." }, { status: 400 });
  const r = verifyOtp(p, code);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 401 });
  const user = await findOrCreateUser(p);
  await startSession(user.id);
  return NextResponse.json({ needsProfile: !user.name });
}
