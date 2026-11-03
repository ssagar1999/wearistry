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
    expect(migrations.map((migration) => migration.id)).toEqual([
      "001-users-phone-partial-unique",
      "002-threads-split-replies-likes",
      "003-products-media-urls",
      "004-contract-legacy-thread-arrays-and-indexes",
      "005-products-state-backfill",
    ]);
  });

  it("001 converts the old phone index, keeps phone uniqueness, backfills verification, and reruns safely", async () => {
    const users = db.collection("users");
    // The shape the frontend created: a plain unique phone index and an unverified field.
    await users.createIndex({ phone: 1 }, { unique: true, name: "phone_1" });
    const createdAt = new Date("2026-11-01T10:00:00Z");
    await users.insertOne({ uid: "u1", phone: "9000000001", name: "Old user", createdAt });

    const migrations = (await loadMigrations()).slice(0, 1);
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

  it("002 copies embedded replies and likes into their own collections, keeps the originals, and reruns safely", async () => {
    const threads = db.collection("threads");
    const replyId = new mongoose.Types.ObjectId();
    await threads.insertMany([
      {
        slug: "t1",
        author: "Aarti",
        text: "Dabu skirt",
        likes: 24,
        at: 1,
        likedBy: ["user-a", "user-b"],
        replies: [
          { _id: replyId, author: "Zoya", text: "Gorgeous!", at: 1793618064160 },
          { _id: new mongoose.Types.ObjectId(), author: "Aarti", text: "Thanks", at: 1793621664160 },
        ],
      },
      { slug: "t2", author: "Kabir", text: "Looking for denim", likes: 8, at: 2, likedBy: [], replies: [] },
    ]);
    const migration = (await loadMigrations()).find((m) => m.id === "002-threads-split-replies-likes");
    if (!migration) throw new Error("migration 002 missing");

    await migration.up(db);
    await migration.up(db); // rerun: must not duplicate anything

    const replies = await db
      .collection("thread_replies")
      .find({ threadId: "t1" })
      .sort({ createdAt: 1 })
      .toArray();
    expect(replies.map((r) => r.text)).toEqual(["Gorgeous!", "Thanks"]);
    expect(String(replies[0]._id)).toBe(String(replyId)); // original IDs kept
    expect(replies[0].createdAt).toEqual(new Date(1793618064160));
    expect(await db.collection("thread_likes").countDocuments({ threadId: "t1" })).toBe(2);

    const t1 = await threads.findOne({ slug: "t1" });
    expect(t1?.replyCount).toBe(2);
    expect(t1?.likes).toBe(24); // the count is untouched
    expect(t1?.replies).toHaveLength(2); // expand only: legacy arrays are not deleted
    expect((await threads.findOne({ slug: "t2" }))?.replyCount).toBe(0);

    await expect(
      db.collection("thread_likes").insertOne({ threadId: "t1", userId: "user-a" }),
    ).rejects.toMatchObject({ code: 11000 });
  });

  it("003 rewrites old web-app photo URLs to the API's media route and leaves others alone", async () => {
    const products = db.collection("products");
    const uuid = "ee011015-4d89-4de7-acd4-f2dcd978b130";
    await products.insertMany([
      {
        slug: "local",
        image: `/api/img/${uuid}`,
        images: [`/api/img/${uuid}`, "https://cdn.example/photos/x"],
      },
      {
        slug: "sample",
        image: "https://lh3.googleusercontent.com/a",
        images: ["https://lh3.googleusercontent.com/a"],
      },
    ]);
    const migration = (await loadMigrations()).find((m) => m.id === "003-products-media-urls");
    if (!migration) throw new Error("migration 003 missing");

    await migration.up(db);
    await migration.up(db);

    expect(await products.findOne({ slug: "local" })).toMatchObject({
      image: `/api/v1/media/${uuid}`,
      images: [`/api/v1/media/${uuid}`, "https://cdn.example/photos/x"],
    });
    expect((await products.findOne({ slug: "sample" }))?.image).toBe("https://lh3.googleusercontent.com/a");
  });

  describe("004 (destructive contract step)", () => {
    const find = async () => {
      const migration = (await loadMigrations()).find(
        (m) => m.id === "004-contract-legacy-thread-arrays-and-indexes",
      );
      if (!migration) throw new Error("migration 004 missing");
      return migration;
    };

    it("refuses to run when a legacy reply or like hasn't been copied yet, and changes nothing", async () => {
      await db.collection("threads").deleteMany({});
      await db.collection("thread_replies").deleteMany({});
      await db.collection("thread_likes").deleteMany({});
      await db.collection("threads").insertOne({
        slug: "uncopied",
        author: "A",
        text: "Old",
        at: 1,
        replies: [{ _id: new mongoose.Types.ObjectId(), author: "B", text: "Hi", at: 1 }],
        likedBy: ["u1"],
      });
      await expect((await find()).up(db)).rejects.toThrow(/Run migration 002 first/);
      expect((await db.collection("threads").findOne({ slug: "uncopied" }))?.replies).toHaveLength(1);
    });

    it("after 002, removes the legacy arrays, keeps the copies, drops unused indexes only, and reruns safely", async () => {
      await db.collection("threads").deleteMany({});
      await db.collection("thread_replies").deleteMany({});
      await db.collection("thread_likes").deleteMany({});
      await db.collection("threads").insertOne({
        slug: "copied",
        author: "A",
        text: "Old",
        at: 1,
        replies: [{ _id: new mongoose.Types.ObjectId(), author: "B", text: "Hi", at: 1793618064160 }],
        likedBy: ["u1"],
      });
      await db.collection("threads").createIndex({ at: 1 }, { name: "at_1" });
      await db.collection("threads").createIndex({ at: -1, _id: -1 });
      await db.collection("products").createIndex({ city: 1 }, { name: "city_1" });
      await db.collection("products").createIndex({ slug: 1 }, { unique: true, name: "slug_1" });

      const migrations = await loadMigrations();
      await migrations.find((m) => m.id === "002-threads-split-replies-likes")?.up(db);
      const four = await find();
      await four.up(db);
      await four.up(db); // rerun

      const thread = await db.collection("threads").findOne({ slug: "copied" });
      expect(thread).not.toHaveProperty("replies");
      expect(thread).not.toHaveProperty("likedBy");
      expect(thread?.replyCount).toBe(1);
      expect(await db.collection("thread_replies").countDocuments({ threadId: "copied" })).toBe(1);
      expect(await db.collection("thread_likes").countDocuments({ threadId: "copied" })).toBe(1);

      const threadIndexes = (await db.collection("threads").indexes()).map((i) => i.name);
      expect(threadIndexes).not.toContain("at_1");
      expect(threadIndexes).toContain("at_-1__id_-1"); // the compound index stays
      const productIndexes = (await db.collection("products").indexes()).map((i) => i.name);
      expect(productIndexes).not.toContain("city_1");
      expect(productIndexes).toContain("slug_1"); // needed indexes stay
    });

    it("005 fills in the state from the city, keeps states already set, and reruns safely", async () => {
      const products = db.collection("products");
      await products.deleteMany({});
      await products.insertMany([
        { slug: "a", city: "Pune" },
        { slug: "b", city: "Jaipur", state: "" },
        { slug: "c", city: "Kolkata", state: "West Bengal" },
        { slug: "d", city: "Elsewhere" },
      ]);
      const five = (await loadMigrations()).find((m) => m.id === "005-products-state-backfill");
      await five?.up(db);
      await five?.up(db); // rerun

      const state = async (/** @type {string} */ slug) => (await products.findOne({ slug }))?.state;
      expect(await state("a")).toBe("Maharashtra");
      expect(await state("b")).toBe("Rajasthan");
      expect(await state("c")).toBe("West Bengal");
      expect(await state("d")).toBeUndefined(); // unknown cities are left alone
    });
  });
});
