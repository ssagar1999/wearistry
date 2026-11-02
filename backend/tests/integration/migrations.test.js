import mongoose from "mongoose";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadMigrations, pendingMigrations, runMigrations } from "../../src/config/migrations.js";
import { testEnv } from "../helpers/test-app.js";

/** @type {import("mongodb").Db} */
let db;

beforeAll(async () => {
  // Plain connection: like `npm run migrate`, migrations run before the app creates its own indexes.
  await mongoose.connect(testEnv().MONGODB_URI);
  db = /** @type {import("mongodb").Db} */ (mongoose.connection.db);
});
afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

describe("migrations", () => {
  it("loads migration files in order", async () => {
    const migrations = await loadMigrations(path.resolve(import.meta.dirname, "../../migrations"));
    expect(migrations.map((migration) => migration.id)).toEqual(["001-users-phone-partial-unique"]);
  });

  it("001 converts the old phone index, keeps phone uniqueness, backfills verification, and reruns safely", async () => {
    const users = db.collection("users");
    // The shape the frontend created: a plain unique phone index and an unverified field.
    await users.createIndex({ phone: 1 }, { unique: true, name: "phone_1" });
    const createdAt = new Date("2026-11-01T10:00:00Z");
    await users.insertOne({ uid: "u1", phone: "9000000001", name: "Old user", createdAt });

    const migrations = await loadMigrations();
    expect(await runMigrations(db, migrations, () => {})).toEqual(["001-users-phone-partial-unique"]);

    const phoneIndex = (await users.indexes()).find((index) => index.name === "phone_1");
    expect(phoneIndex?.partialFilterExpression).toEqual({ phone: { $type: "string" } });
    expect((await users.findOne({ uid: "u1" }))?.phoneVerifiedAt).toEqual(createdAt);

    await users.insertMany([{ uid: "g1" }, { uid: "g2" }]); // several users without phones are now allowed
    await expect(users.insertOne({ uid: "u2", phone: "9000000001" })).rejects.toMatchObject({ code: 11000 });

    // Recorded as applied, so running again does nothing; running the step itself again is also safe.
    expect(await pendingMigrations(db, migrations)).toEqual([]);
    expect(await runMigrations(db, migrations, () => {})).toEqual([]);
    await expect(migrations[0].up(db)).resolves.toBeUndefined();
  });
});
