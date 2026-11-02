import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/session";
import { updateProfile } from "@/lib/users";

const body = z.object({ name: z.string().trim().min(2).max(40), city: z.string().trim().max(40).default("") });

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Please log in." }, { status: 401 });
  const parsed = body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Add your name (at least 2 letters)." }, { status: 400 });
  return NextResponse.json(await updateProfile(user.id, parsed.data));
}
