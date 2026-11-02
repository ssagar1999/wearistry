/**
 * Photos uploaded before the API existed were served by the web app at "/api/img/<uuid>"; the API serves
 * them at "/api/v1/media/<uuid>". Rewrites those URLs on listings (cover and gallery). S3/CloudFront URLs and
 * sample-data URLs are untouched. The files themselves are local development files: copy
 * frontend/.data/uploads/* to backend/.data/uploads/ (see docs/MIGRATIONS.md).
 *
 * Safe to rerun: only documents still containing the old prefix match.
 */
export const id = "003-products-media-urls";
export const description = "rewrite /api/img/ photo URLs on products to /api/v1/media/";

/** @param {import("mongodb").Db} db */
export async function up(db) {
  const rewrite = (/** @type {string} */ field) => ({
    $replaceOne: { input: field, find: "/api/img/", replacement: "/api/v1/media/" },
  });
  await db
    .collection("products")
    .updateMany({ $or: [{ image: /^\/api\/img\// }, { images: /^\/api\/img\// }] }, [
      {
        $set: {
          image: rewrite("$image"),
          images: { $map: { input: { $ifNull: ["$images", []] }, as: "url", in: rewrite("$$url") } },
        },
      },
    ]);
}
