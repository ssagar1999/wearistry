import { readLocal } from "@/lib/images";

export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const data = await readLocal((await params).file);
  if (!data) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": "image/webp",
      // File names are unique per upload, so browsers and CDNs can cache them forever.
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
