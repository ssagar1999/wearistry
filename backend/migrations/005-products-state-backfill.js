/**
 * Adds a state to every listing so buyers can filter to their own state.
 *
 * Before: `products.state` is empty (the field existed but was never filled in).
 * After:  `state` is set from the listing's city, and a {status, state, createdAt, _id} index is created by
 *         the app's `ensureIndexes` on startup.
 *
 * Additive and safe to rerun: it only touches listings whose state is empty, and never overwrites one.
 * The map is copied here on purpose: a migration must keep working even if the app's list changes later.
 */
export const id = "005-products-state-backfill";
export const description = "products.state backfilled from city";

const STATE_OF_CITY = /** @type {Record<string, string>} */ ({
  Mumbai: "Maharashtra",
  Pune: "Maharashtra",
  Delhi: "Delhi",
  Bengaluru: "Karnataka",
  Kolkata: "West Bengal",
  Jaipur: "Rajasthan",
  Hyderabad: "Telangana",
  Chennai: "Tamil Nadu",
  Ahmedabad: "Gujarat",
});

/** @param {import("mongodb").Db} db */
export async function up(db) {
  const products = db.collection("products");
  for (const [city, state] of Object.entries(STATE_OF_CITY)) {
    await products.updateMany(
      { city, $or: [{ state: { $exists: false } }, { state: "" }] },
      { $set: { state } },
    );
  }
}
