import { Router } from "express";
import { requireUser } from "../../middleware/auth.middleware.js";
import { validate } from "../../middleware/validate.middleware.js";
import { createProductController } from "./product.controller.js";
import { createProductBody, listProductsQuery, productParams } from "./product.schemas.js";

/** @param {{ media: import("../uploads/media.storage.js").MediaStorage }} deps */
export function createProductsRouter(deps) {
  const controller = createProductController(deps);
  const router = Router();
  router.get("/", validate({ query: listProductsQuery }), controller.list);
  router.get("/:id", validate({ params: productParams }), controller.get);
  router.post("/", requireUser, validate({ body: createProductBody }), controller.create);
  return router;
}
