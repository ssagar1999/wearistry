import { NextResponse } from "next/server";
import { normalizePhone } from "@/lib/phone";
import { sendOtp } from "@/lib/otp";

export async function POST(req: Request) {
  const { phone } = await req.json().catch(() => ({}));
  const p = typeof phone === "string" ? normalizePhone(phone) : null;
  if (!p) return NextResponse.json({ error: "Enter a 10-digit Indian mobile number." }, { status: 400 });
  try {
    const r = await sendOtp(p);
    return NextResponse.json(r, { status: r.ok ? 200 : 429 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Couldn’t send the SMS right now. Please try again." }, { status: 503 });
  }
}
