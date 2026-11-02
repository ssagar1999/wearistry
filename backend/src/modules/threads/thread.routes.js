import { Router } from "express";
import { requireUser } from "../../middleware/auth.middleware.js";
import { validate } from "../../middleware/validate.middleware.js";
import { create, like, list, replies, reply, unlike } from "./thread.controller.js";
import {
  createReplyBody,
  createThreadBody,
  listRepliesQuery,
  listThreadsQuery,
  threadParams,
} from "./thread.schemas.js";

export const threadsRouter = Router();

threadsRouter.get("/", validate({ query: listThreadsQuery }), list);
threadsRouter.post("/", requireUser, validate({ body: createThreadBody }), create);
threadsRouter.post("/:id/like", requireUser, validate({ params: threadParams }), like);
threadsRouter.delete("/:id/like", requireUser, validate({ params: threadParams }), unlike);
threadsRouter.get("/:id/replies", validate({ params: threadParams, query: listRepliesQuery }), replies);
threadsRouter.post(
  "/:id/replies",
  requireUser,
  validate({ params: threadParams, body: createReplyBody }),
  reply,
);
