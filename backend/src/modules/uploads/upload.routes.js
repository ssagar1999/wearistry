import { Router } from "express";
import multer from "multer";
import { requireUser } from "../../middleware/auth.middleware.js";
import { createRateLimiter } from "../../middleware/rate-limit.middleware.js";
import { ApiError } from "../../utils/api-error.js";
import { MAX_UPLOAD_BYTES } from "./media.storage.js";

const UPLOADS_PER_HOUR = 80; // 10 listings × 8 photos; image processing is CPU-heavy, so this is per user

/**
 * POST /api/v1/uploads: one photo per request (multipart field "file"), so the browser can show progress
 * per photo and retry just the one that failed.
 *
 * @param {{ media: import("./media.storage.js").MediaStorage }} deps
 */
export function createUploadsRouter({ media }) {
  // Files stay in memory (max 15 MB, one at a time) and go straight to sharp; nothing unprocessed touches disk.
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
  });
  const perUser = createRateLimiter({
    windowMs: 60 * 60_000,
    limit: UPLOADS_PER_HOUR,
    keyGenerator: (req) => /** @type {NonNullable<typeof req.user>} */ (req.user).id,
  });

  const router = Router();
  router.post("/", requireUser, perUser, upload.single("file"), async (req, res) => {
    if (!req.file) throw ApiError.badRequest('Attach the photo as the "file" field.');
    res.status(201).json({ data: { url: await media.store(req.file.buffer) } });
  });
  return router;
}

/**
 * GET /api/v1/media/:file: serves locally stored photos in development. In production photos are on S3,
 * served by CloudFront, and this route finds nothing.
 *
 * @param {{ media: import("./media.storage.js").MediaStorage }} deps
 */
export function createMediaRouter({ media }) {
  const router = Router();
  router.get("/:file", async (req, res) => {
    const data = await media.readLocal(req.params.file);
    if (!data) throw ApiError.notFound("Photo not found.");
    // File names are unique per upload and never change, so browsers and CDNs may cache them forever.
    res
      .set({ "Content-Type": "image/webp", "Cache-Control": "public, max-age=31536000, immutable" })
      .send(data);
  });
  return router;
}
