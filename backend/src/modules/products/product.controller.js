import { validated } from "../../middleware/validate.middleware.js";
import { ApiError } from "../../utils/api-error.js";
import { createProductBody, listProductsQuery, productParams } from "./product.schemas.js";
import { createProduct, getProduct, listProducts } from "./product.service.js";

/** @typedef {import("express").Request} Request */
/** @typedef {import("express").Response} Response */

/** @param {{ media: import("../uploads/media.storage.js").MediaStorage }} deps */
export function createProductController({ media }) {
  return {
    /** @param {Request} req @param {Response} res */
    async list(req, res) {
      const query = validated(req, "query", listProductsQuery);
      const { items, nextCursor } = await listProducts(query);
      res.json({ data: items, meta: { nextCursor, limit: query.limit } });
    },

    /** @param {Request} req @param {Response} res */
    async get(req, res) {
      const { id } = validated(req, "params", productParams);
      res.json({ data: await getProduct(id) });
    },

    /** @param {Request} req @param {Response} res */
    async create(req, res) {
      if (!req.user) throw ApiError.unauthenticated();
      const input = validated(req, "body", createProductBody);
      const product = await createProduct(req.user, input, (url) => media.isOwnPhotoUrl(url));
      res.status(201).json({ data: product });
    },
  };
}
