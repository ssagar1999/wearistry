import { NextResponse } from "next/server";
import { currentUser } from "@/lib/session";
import { ImageError, MAX_UPLOAD_BYTES, storePhoto } from "@/lib/images";

const PER_HOUR = 80;
const g = globalThis as unknown as { _uploads?: Map<string, number[]> };
const recent = (g._uploads ??= new Map<string, number[]>());

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user?.name) return NextResponse.json({ error: "Please log in to upload photos." }, { status: 401 });

  const now = Date.now();
  const times = (recent.get(user.id) ?? []).filter((t) => now - t < 3600_000);
  if (times.length >= PER_HOUR) return NextResponse.json({ error: "Too many uploads. Try again in a bit." }, { status: 429 });

  const file = (await req.formData().catch(() => null))?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No photo received." }, { status: 400 });
  if (file.size > MAX_UPLOAD_BYTES) return NextResponse.json({ error: "Photo is over 15 MB." }, { status: 413 });

  try {
    const url = await storePhoto(Buffer.from(await file.arrayBuffer()));
    recent.set(user.id, [...times, now]);
    return NextResponse.json({ url }, { status: 201 });
  } catch (err) {
    if (err instanceof ImageError) return NextResponse.json({ error: err.message }, { status: 415 });
    console.error(err);
    return NextResponse.json({ error: "Couldn’t save that photo. Please try again." }, { status: 500 });
  }
}
