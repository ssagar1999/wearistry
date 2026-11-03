import { Router } from "express";
import { requireUser } from "../../middleware/auth.middleware.js";
import { createRateLimiter } from "../../middleware/rate-limit.middleware.js";
import { validate } from "../../middleware/validate.middleware.js";
import { create, decide, list } from "./swap.controller.js";
import { createSwapBody, decideSwapBody, listSwapsQuery, swapParams } from "./swap.schemas.js";

const REQUESTS_PER_HOUR = 20; // stops one account from spamming sellers

export const swapsRouter = Router();

const perUser = createRateLimiter({
  windowMs: 60 * 60_000,
  limit: REQUESTS_PER_HOUR,
  keyGenerator: (req) => /** @type {NonNullable<typeof req.user>} */ (req.user).id,
});

swapsRouter.get("/", requireUser, validate({ query: listSwapsQuery }), list);
swapsRouter.post("/", requireUser, perUser, validate({ body: createSwapBody }), create);
swapsRouter.patch("/:id", requireUser, validate({ params: swapParams, body: decideSwapBody }), decide);
