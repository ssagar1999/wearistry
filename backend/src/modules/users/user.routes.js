import { Router } from "express";
import { requireUser } from "../../middleware/auth.middleware.js";
import { validate } from "../../middleware/validate.middleware.js";
import { updateMyProfile } from "./user.controller.js";
import { updateProfileBody } from "./user.schemas.js";

export const usersRouter = Router();

usersRouter.patch("/me", requireUser, validate({ body: updateProfileBody }), updateMyProfile);
