import { z } from "zod";

export const PublicUser = z
  .object({
    id: z.string(),
    name: z.string(),
    city: z.string(),
    phone: z.string().nullable(),
    phoneVerified: z.boolean(),
    email: z.string().nullable(),
    avatarUrl: z.string().nullable(),
  })
  .meta({ id: "User" });

export const updateProfileBody = z
  .object({
    name: z.string().trim().min(2, "Name must be at least 2 characters.").max(40),
    city: z.string().trim().max(40).default(""),
  })
  .strict();
