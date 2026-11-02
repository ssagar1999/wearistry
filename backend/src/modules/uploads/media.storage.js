import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import sharp from "sharp";
import { ApiError } from "../../utils/api-error.js";

// Every photo is stored at these widths so phones download a small file and desktops get a sharp one.
export const PHOTO_WIDTHS = /** @type {const} */ ([480, 960, 1600]);
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
const WEBP_QUALITY = 82; // visually indistinguishable from the original for photos, a fraction of the size
const ACCEPTED_FORMATS = new Set(["jpeg", "png", "webp", "avif", "heif", "tiff"]);
const LOCAL_URL_PREFIX = "/api/v1/media/";
const PHOTO_ID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const LOCAL_FILE = new RegExp(`^${PHOTO_ID}-(480|960|1600)\\.webp$`);

/**
 * Auto-rotates, converts to sRGB, strips all metadata (including GPS location) and encodes WebP variants.
 *
 * @param {Buffer} input
 */
async function encodeVariants(input) {
  const image = sharp(input, { failOn: "error", limitInputPixels: 60_000_000 });
  const meta = await image.metadata().catch(() => null);
  if (!meta?.format || !ACCEPTED_FORMATS.has(meta.format)) {
    throw ApiError.badRequest("Please upload a JPG, PNG or WebP photo.");
  }
  const base = image.rotate().toColourspace("srgb");
  return Promise.all(
    PHOTO_WIDTHS.map(async (width) => ({
      width,
      data: await base
        .clone()
        .resize({ width, height: width * 2, fit: "inside", withoutEnlargement: true })
        .webp({ quality: WEBP_QUALITY, effort: 5, smartSubsample: true })
        .toBuffer(),
    })),
  );
}

/**
 * Saves photos to S3 when configured (production), otherwise to local disk (development).
 * A stored photo is identified by a URL "<base>/<uuid>"; clients append "-480.webp" etc. for each size.
 *
 * @param {Pick<import("../../config/env.js").Env, "AWS_REGION" | "S3_BUCKET" | "S3_PUBLIC_URL" | "S3_ENDPOINT" | "UPLOAD_DIR">} env
 */
export function createMediaStorage(env) {
  const uploadDir = path.resolve(env.UPLOAD_DIR);
  const s3 =
    env.S3_BUCKET && env.S3_PUBLIC_URL
      ? {
          bucket: env.S3_BUCKET,
          publicUrl: env.S3_PUBLIC_URL,
          client: new S3Client({
            region: env.AWS_REGION,
            ...(env.S3_ENDPOINT && { endpoint: env.S3_ENDPOINT, forcePathStyle: true }),
          }),
        }
      : undefined;
  const s3Url = s3 && new RegExp(`^${escapeRegExp(s3.publicUrl)}/photos/${PHOTO_ID}$`);
  const localUrl = new RegExp(`^${escapeRegExp(LOCAL_URL_PREFIX)}${PHOTO_ID}$`);

  return {
    /** @param {Buffer} input @returns {Promise<string>} the photo URL to store on a listing */
    async store(input) {
      const variants = await encodeVariants(input);
      const id = randomUUID();
      if (s3) {
        await Promise.all(
          variants.map(({ width, data }) =>
            s3.client.send(
              new PutObjectCommand({
                Bucket: s3.bucket,
                Key: `photos/${id}-${width}.webp`,
                Body: data,
                ContentType: "image/webp",
                CacheControl: "public, max-age=31536000, immutable",
              }),
            ),
          ),
        );
        return `${s3.publicUrl}/photos/${id}`;
      }
      await mkdir(uploadDir, { recursive: true });
      await Promise.all(
        variants.map(({ width, data }) => writeFile(path.join(uploadDir, `${id}-${width}.webp`), data)),
      );
      return `${LOCAL_URL_PREFIX}${id}`;
    },

    /**
     * Reads a locally stored variant. The strict filename pattern also blocks path traversal.
     *
     * @param {string} file e.g. "<uuid>-960.webp"
     */
    async readLocal(file) {
      if (!LOCAL_FILE.test(file)) return null;
      try {
        return await readFile(path.join(uploadDir, file));
      } catch (error) {
        if (/** @type {NodeJS.ErrnoException} */ (error).code === "ENOENT") return null;
        throw error;
      }
    },

    /** Only photos stored by this pipeline may be attached to a listing. @param {string} url */
    isOwnPhotoUrl(url) {
      return localUrl.test(url) || Boolean(s3Url?.test(url));
    },
  };
}

/** @typedef {ReturnType<typeof createMediaStorage>} MediaStorage */

/** @param {string} value */
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
