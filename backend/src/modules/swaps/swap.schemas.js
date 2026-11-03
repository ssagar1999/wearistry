import { z } from "zod";
import { pageQuery } from "../../utils/pagination.js";

export const createSwapBody = z
  .object({
    productId: z.string().regex(/^[a-z0-9-]{1,120}$/, "Invalid listing ID."),
    offer: z.string().trim().min(2, "Say what you're offering.").max(300),
    note: z.string().trim().max(500).default(""),
  })
  .strict();

export const listSwapsQuery = z
  .object({ ...pageQuery, box: z.enum(["received", "sent"]).default("received") })
  .strict();
export const swapParams = z
  .object({ id: z.string().regex(/^[0-9a-f]{24}$/, "Invalid request ID.") })
  .strict();
export const decideSwapBody = z.object({ action: z.enum(["accept", "decline", "cancel"]) }).strict();

export const SwapRequestView = z
  .object({
    id: z.string(),
    product: z.object({ id: z.string(), title: z.string(), image: z.string() }),
    offer: z.string(),
    note: z.string(),
    status: z.enum(["pending", "accepted", "declined", "cancelled"]),
    createdAt: z.number().meta({ description: "Epoch milliseconds" }),
    counterpart: z.object({ id: z.string(), name: z.string() }).meta({
      description:
        "The other person: the requester in your received box, the listing's seller in your sent box",
    }),
    contactPhone: z.string().nullable().meta({
      description: "The other person's phone. Only after the owner accepts, and only for the two of them",
    }),
  })
  .meta({ id: "SwapRequest" });
