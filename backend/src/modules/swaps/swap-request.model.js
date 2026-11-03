import mongoose from "mongoose";

/**
 * `swap_requests`: one person offering one of their pieces for a listing that's open to swaps.
 * Its own collection because requests accumulate without limit (embedding them in the listing would grow it
 * forever). Names and the listing's title and photo are copied in, so both inboxes render without lookups.
 */
const swapRequestSchema = new mongoose.Schema(
  {
    productId: { type: String, required: true }, // products.slug
    productTitle: { type: String, required: true },
    productImage: { type: String, required: true },
    ownerId: { type: String, required: true }, // users.uid of the listing's seller
    ownerName: { type: String, required: true },
    requesterId: { type: String, required: true }, // users.uid
    requesterName: { type: String, required: true },
    offer: { type: String, required: true, maxlength: 300 }, // what the requester is offering
    note: { type: String, default: "", maxlength: 500 },
    status: { type: String, enum: ["pending", "accepted", "declined", "cancelled"], default: "pending" },
  },
  { timestamps: true, collection: "swap_requests" },
);

// "Requests I received" and "requests I sent", newest first, cursor-paginated.
swapRequestSchema.index({ ownerId: 1, createdAt: -1, _id: -1 });
swapRequestSchema.index({ requesterId: 1, createdAt: -1, _id: -1 });
// One open request per person per piece; the database enforces it, so double-taps can't create two.
swapRequestSchema.index(
  { requesterId: 1, productId: 1 },
  { unique: true, partialFilterExpression: { status: "pending" } },
);

export const SwapRequest = mongoose.models.SwapRequest ?? mongoose.model("SwapRequest", swapRequestSchema);
