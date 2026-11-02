import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/session";
import { likeThread, replyThread } from "@/lib/threads";

const body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("like") }),
  z.object({ action: z.literal("reply"), text: z.string().trim().min(1).max(500) }),
]);

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user?.name) return NextResponse.json({ error: "Please log in." }, { status: 401 });
  const { id } = await params;
  const parsed = body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json(parsed.error.flatten(), { status: 400 });
  const d = parsed.data;
  if (d.action === "like") {
    const r = await likeThread(id, user.id);
    return r ? NextResponse.json(r) : NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(await replyThread(id, { author: user.name, text: d.text }), { status: 201 });
}
