import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/session";
import { createThread, listThreads } from "@/lib/threads";

const body = z.object({
  kind: z.enum(["post", "looking", "swap"]).default("post"),
  text: z.string().trim().min(2).max(500),
  productId: z.string().optional(),
});

export async function GET() {
  const user = await currentUser();
  return NextResponse.json(await listThreads(user?.id));
}

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user?.name) return NextResponse.json({ error: "Please log in to post." }, { status: 401 });
  const parsed = body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json(parsed.error.flatten(), { status: 400 });
  return NextResponse.json(await createThread({ ...parsed.data, authorId: user.id, author: user.name, city: user.city }), { status: 201 });
}
