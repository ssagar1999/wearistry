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

export const publicProfileParams = z.object({ id: z.uuid() }).strict();

/** What anyone may see about a seller. No phone, no email. */
export const PublicProfile = z
  .object({
    id: z.string(),
    name: z.string(),
    city: z.string(),
    avatarUrl: z.string().nullable(),
    verified: z.boolean().meta({ description: "Has a phone number verified by OTP" }),
    memberSince: z.string().meta({ description: "ISO date" }),
  })
  .meta({ id: "PublicProfile" });

export const updateProfileBody = z
  .object({
    name: z.string().trim().min(2, "Name must be at least 2 characters.").max(40),
    city: z.string().trim().max(40).default(""),
  })
  .strict();
