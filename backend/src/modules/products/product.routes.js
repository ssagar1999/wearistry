import { Router } from "express";
import { requireUser } from "../../middleware/auth.middleware.js";
import { validate } from "../../middleware/validate.middleware.js";
import { createProductController } from "./product.controller.js";
import {
  createProductBody,
  listMyProductsQuery,
  listProductsQuery,
  productParams,
  updateProductBody,
} from "./product.schemas.js";

/** @param {{ media: import("../uploads/media.storage.js").MediaStorage }} deps */
export function createProductsRouter(deps) {
  const controller = createProductController(deps);
  const router = Router();
  router.get("/", validate({ query: listProductsQuery }), controller.list);
  // Must come before "/:id", or "mine" would be read as a listing ID.
  router.get("/mine", requireUser, validate({ query: listMyProductsQuery }), controller.mine);
  router.get("/:id", validate({ params: productParams }), controller.get);
  router.post("/", requireUser, validate({ body: createProductBody }), controller.create);
  router.patch(
    "/:id",
    requireUser,
    validate({ params: productParams, body: updateProductBody }),
    controller.update,
  );
  router.delete("/:id", requireUser, validate({ params: productParams }), controller.remove);
  return router;
}
