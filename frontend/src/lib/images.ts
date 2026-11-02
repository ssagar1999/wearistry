import { randomUUID } from "crypto";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import sharp from "sharp";
import { devMode } from "./env";

// Every photo is stored at these widths so phones download a small file and desktops get a sharp one.
export const WIDTHS = [480, 960, 1600] as const;
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
const QUALITY = 82; // WebP at this level is visually indistinguishable from the original for photos

const UPLOAD_DIR = path.join(process.cwd(), ".data", "uploads");

export class ImageError extends Error {}

/** Auto-rotates, strips EXIF (including GPS location), converts to sRGB and encodes WebP variants. */
async function variants(input: Buffer) {
  const img = sharp(input, { failOn: "error", limitInputPixels: 60_000_000 });
  const meta = await img.metadata().catch(() => null);
  if (!meta || !["jpeg", "png", "webp", "avif", "heif", "tiff"].includes(meta.format ?? ""))
    throw new ImageError("Please upload a JPG, PNG or WebP photo.");
  const base = img.rotate().toColourspace("srgb");
  return Promise.all(
    WIDTHS.map(async (w) => ({
      w,
      data: await base.clone().resize({ width: w, height: w * 2, fit: "inside", withoutEnlargement: true })
        .webp({ quality: QUALITY, effort: 5, smartSubsample: true }).toBuffer(),
    })),
  );
}

async function saveLocal(id: string, files: { w: number; data: Buffer }[]) {
  await mkdir(UPLOAD_DIR, { recursive: true });
  await Promise.all(files.map((f) => writeFile(path.join(UPLOAD_DIR, `${id}-${f.w}.webp`), f.data)));
  return `/api/img/${id}`;
}

// Amazon S3 (or any S3-compatible store via S3_ENDPOINT). Files are served from S3_PUBLIC_URL,
// ideally a CloudFront domain so photos come from edge servers inside India.
let s3: S3Client | undefined;
async function saveS3(id: string, files: { w: number; data: Buffer }[]) {
  const bucket = process.env.S3_BUCKET!, base = process.env.S3_PUBLIC_URL!.replace(/\/$/, "");
  s3 ??= new S3Client({
    region: process.env.AWS_REGION ?? "ap-south-1",
    ...(process.env.S3_ENDPOINT && { endpoint: process.env.S3_ENDPOINT, forcePathStyle: true }),
  });
  await Promise.all(files.map((f) => s3!.send(new PutObjectCommand({
    Bucket: bucket, Key: `photos/${id}-${f.w}.webp`, Body: f.data,
    ContentType: "image/webp", CacheControl: "public, max-age=31536000, immutable",
  }))));
  return `${base}/photos/${id}`;
}

const s3Enabled = () => !!(process.env.S3_BUCKET && process.env.S3_PUBLIC_URL);

export async function storePhoto(input: Buffer): Promise<string> {
  const files = await variants(input);
  if (s3Enabled()) return saveS3(randomUUID(), files);
  if (!devMode()) throw new Error("S3_BUCKET and S3_PUBLIC_URL must be set in production");
  return saveLocal(randomUUID(), files);
}

export async function readLocal(file: string) {
  if (!/^[0-9a-f-]{36}-(480|960|1600)\.webp$/.test(file)) return null; // also blocks path traversal
  return readFile(path.join(UPLOAD_DIR, file)).catch(() => null);
}

/** Only our own storage URLs may be attached to a listing. */
export function isOwnPhotoUrl(u: string) {
  const id = "[0-9a-f-]{36}";
  if (new RegExp(`^/api/img/${id}$`).test(u)) return true;
  const base = process.env.S3_PUBLIC_URL?.replace(/\/$/, "");
  return !!base && u.startsWith(`${base}/photos/`) && new RegExp(`/photos/${id}$`).test(u);
}
