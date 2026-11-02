// Shrinks a phone photo in the browser before upload: a 7–10 MB camera photo becomes roughly 0.5–1.5 MB
// with no visible quality loss, so uploads are quick on mobile data. The server makes the final versions.
const MAX_EDGE = 2400;
const QUALITY = 0.9;

export async function compressForUpload(file: File): Promise<Blob> {
  if (file.size < 500 * 1024) return file;
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, MAX_EDGE / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close();
    const toBlob = (type: string) => new Promise<Blob | null>((r) => canvas.toBlob(r, type, QUALITY));
    // Older Safari can't encode WebP and silently returns PNG, so fall back to JPEG.
    let out = await toBlob("image/webp");
    if (!out || out.type !== "image/webp") out = await toBlob("image/jpeg");
    return out && out.size < file.size ? out : file;
  } catch {
    return file; // browser can't decode it (e.g. HEIC on desktop Chrome); let the server try
  }
}
