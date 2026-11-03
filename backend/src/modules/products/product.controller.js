import { validated } from "../../middleware/validate.middleware.js";
import { ApiError } from "../../utils/api-error.js";
import {
  createProductBody,
  listMyProductsQuery,
  listProductsQuery,
  productParams,
  updateProductBody,
} from "./product.schemas.js";
import {
  createProduct,
  getProduct,
  listMyProducts,
  listProducts,
  removeProduct,
  updateProduct,
} from "./product.service.js";

/** @typedef {import("express").Request} Request */
/** @typedef {import("express").Response} Response */

/** @param {Request} req */
function currentUser(req) {
  if (!req.user) throw ApiError.unauthenticated();
  return req.user;
}

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
    async mine(req, res) {
      const query = validated(req, "query", listMyProductsQuery);
      const { items, nextCursor } = await listMyProducts(currentUser(req).id, query);
      res.json({ data: items, meta: { nextCursor, limit: query.limit } });
    },

    /** @param {Request} req @param {Response} res */
    async get(req, res) {
      const { id } = validated(req, "params", productParams);
      res.json({ data: await getProduct(id) });
    },

    /** @param {Request} req @param {Response} res */
    async create(req, res) {
      const input = validated(req, "body", createProductBody);
      const product = await createProduct(currentUser(req), input, (url) => media.isOwnPhotoUrl(url));
      res.status(201).json({ data: product });
    },

    /** @param {Request} req @param {Response} res */
    async update(req, res) {
      const { id } = validated(req, "params", productParams);
      const patch = validated(req, "body", updateProductBody);
      res.json({ data: await updateProduct(currentUser(req), id, patch) });
    },

    /** @param {Request} req @param {Response} res */
    async remove(req, res) {
      const { id } = validated(req, "params", productParams);
      await removeProduct(currentUser(req), id);
      res.status(204).end();
    },
  };
}
