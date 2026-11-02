import mongoose from "mongoose";
import { z } from "zod";
import { ApiError } from "./api-error.js";

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 50;

/** Query-string fields shared by every paginated list. */
export const pageQuery = {
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  cursor: z.string().max(200).optional(),
};

/**
 * Cursor pagination over a sort on `(field, _id)`. Unlike skip/offset, each page is an index seek that
 * stays fast however deep you go, and items added meanwhile don't shift or repeat results.
 * Cursors are opaque to clients (base64url of [sortValue, id]).
 *
 * @param {string} field the sort field; must be followed by `_id` in a compound index
 * @param {"date" | "number"} type
 * @param {"desc" | "asc"} [direction] newest first (feeds) or oldest first (replies)
 */
export function cursorPaging(field, type, direction = "desc") {
  const order = direction === "desc" ? -1 : 1;
  const beyond = direction === "desc" ? "$lt" : "$gt";
  /** @param {Date | number} value @param {import("mongoose").Types.ObjectId} id */
  const encode = (value, id) =>
    Buffer.from(JSON.stringify([value instanceof Date ? value.toISOString() : value, String(id)])).toString(
      "base64url",
    );

  /** @param {string} cursor */
  function decode(cursor) {
    try {
      const [raw, id] = JSON.parse(Buffer.from(cursor, "base64url").toString());
      const value = type === "date" ? new Date(raw) : Number(raw);
      if (Number.isNaN(type === "date" ? /** @type {Date} */ (value).getTime() : value))
        throw new Error("bad value");
      return { value, id: new mongoose.Types.ObjectId(String(id)) };
    } catch {
      // A tampered or stale cursor is a client error, not a server error.
      throw ApiError.badRequest("Invalid page cursor.");
    }
  }

  return {
    sort: /** @type {Record<string, 1 | -1>} */ ({ [field]: order, _id: order }),

    /** Filter for "items after this cursor" in the sort direction (empty without a cursor). */
    after(/** @type {string | undefined} */ cursor) {
      if (!cursor) return {};
      const { value, id } = decode(cursor);
      return {
        $or: [
          { [field]: mongoose.trusted({ [beyond]: value }) },
          { [field]: value, _id: mongoose.trusted({ [beyond]: id }) },
        ],
      };
    },

    /**
     * Callers fetch `limit + 1` documents; the extra one only tells us whether another page exists.
     *
     * @template {{ _id: import("mongoose").Types.ObjectId }} T
     * @param {T[]} docs
     * @param {number} limit
     * @param {(doc: T) => Date | number} sortValueOf
     */
    page(docs, limit, sortValueOf) {
      const items = docs.slice(0, limit);
      const last = items.at(-1);
      return {
        items,
        nextCursor: docs.length > limit && last ? encode(sortValueOf(last), last._id) : null,
      };
    },
  };
}
