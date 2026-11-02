import mongoose from "mongoose";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Product } from "../../src/modules/products/product.model.js";
import { ThreadLike } from "../../src/modules/threads/thread-like.model.js";
import { ThreadReply } from "../../src/modules/threads/thread-reply.model.js";
import { Thread } from "../../src/modules/threads/thread.model.js";
import { TEST_APP_URL, buildTestApp, connectTestDatabase, dropTestDatabase } from "../helpers/test-app.js";
import { createUserWithSession } from "../helpers/users.js";

const { app, env } = buildTestApp();
const PHOTO = "/api/v1/media/0b5c6a0e-1111-4222-8333-444455556666";

/** @param {string} method @param {string} path @param {string} [cookie] */
function call(method, path, cookie) {
  const req = /** @type {import("supertest").Test} */ (
    /** @type {any} */ (request(app))[method](path).set("Origin", TEST_APP_URL)
  );
  return cookie ? req.set("Cookie", cookie) : req;
}

/** @param {number} n */
const seedThreads = (n) =>
  Thread.insertMany(
    Array.from({ length: n }, (_, i) => ({
      slug: `thread-${i}`,
      author: "Asha",
      text: `Post ${i}`,
      at: Date.now() - i * 1000,
    })),
  );

beforeAll(() => connectTestDatabase(env.MONGODB_URI));
afterAll(() => dropTestDatabase());
beforeEach(async () => {
  await Promise.all([
    Thread.deleteMany({}),
    ThreadLike.deleteMany({}),
    ThreadReply.deleteMany({}),
    Product.deleteMany({}),
  ]);
});

describe("the feed", () => {
  it("is newest first and cursor-paginated without repeats", async () => {
    await seedThreads(23);
    const first = await request(app).get("/api/v1/threads?limit=10").expect(200);
    expect(first.body.data[0].id).toBe("thread-0");
    const seen = first.body.data.map((/** @type {{ id: string }} */ t) => t.id);
    let cursor = first.body.meta.nextCursor;
    while (cursor) {
      const page = await request(app).get(`/api/v1/threads?limit=10&cursor=${cursor}`).expect(200);
      seen.push(...page.body.data.map((/** @type {{ id: string }} */ t) => t.id));
      cursor = page.body.meta.nextCursor;
    }
    expect(new Set(seen).size).toBe(23);
  });

  it("shows the viewer's likes and the mentioned listing's card in one page", async () => {
    await Product.create({
      slug: "dabu-skirt",
      title: "Dabu skirt",
      category: "Skirts",
      size: "M",
      condition: "Good",
      price: 1250,
      image: PHOTO,
      images: [PHOTO],
      city: "Jaipur",
      seller: "Aarti",
    });
    await Thread.create({
      slug: "with-product",
      author: "Aarti",
      text: "New listing!",
      productId: "dabu-skirt",
      at: Date.now(),
    });
    const { user, cookie } = await createUserWithSession();
    await ThreadLike.create({ threadId: "with-product", userId: user.uid });

    const res = await request(app).get("/api/v1/threads").set("Cookie", cookie).expect(200);
    expect(res.body.data[0]).toMatchObject({
      id: "with-product",
      liked: true,
      product: { id: "dabu-skirt", title: "Dabu skirt", price: 1250, image: PHOTO },
    });
    const anonymous = await request(app).get("/api/v1/threads").expect(200);
    expect(anonymous.body.data[0].liked).toBe(false);
  });

  it("never returns legacy embedded arrays from older documents", async () => {
    await Thread.collection.insertOne({
      slug: "legacy",
      author: "Old",
      text: "Old post",
      at: Date.now(),
      likes: 3,
      likedBy: ["u1"],
      replies: [{ author: "x", text: "y", at: 1 }],
    });
    const res = await request(app).get("/api/v1/threads").expect(200);
    expect(res.body.data[0]).not.toHaveProperty("replies");
    expect(res.body.data[0]).not.toHaveProperty("likedBy");
    expect(res.body.data[0].replyCount).toBe(0);
  });
});

describe("posting", () => {
  it("creates a thread as the logged-in user", async () => {
    const { cookie } = await createUserWithSession({ name: "Kabir", city: "Pune" });
    const res = await call("post", "/api/v1/threads", cookie)
      .send({ kind: "looking", text: "Denim jacket, size L?" })
      .expect(201);
    expect(res.body.data).toMatchObject({
      author: "Kabir",
      city: "Pune",
      kind: "looking",
      likes: 0,
      replyCount: 0,
      liked: false,
    });
  });

  it("requires login, a profile name, valid input and an existing listing", async () => {
    await call("post", "/api/v1/threads").send({ text: "Hello there" }).expect(401);
    const nameless = await createUserWithSession({ name: "" });
    await call("post", "/api/v1/threads", nameless.cookie).send({ text: "Hello there" }).expect(403);
    const { cookie } = await createUserWithSession();
    await call("post", "/api/v1/threads", cookie).send({ text: "x" }).expect(400);
    await call("post", "/api/v1/threads", cookie)
      .send({ text: "Hi all", author: "Someone else" })
      .expect(400);
    await call("post", "/api/v1/threads", cookie)
      .send({ text: "Hi all", productId: "missing-listing" })
      .expect(400);
  });
});

describe("likes", () => {
  it("like and unlike are idempotent and keep the count in step", async () => {
    await seedThreads(1);
    const { cookie } = await createUserWithSession();
    expect((await call("post", "/api/v1/threads/thread-0/like", cookie).expect(200)).body.data).toEqual({
      likes: 1,
      liked: true,
    });
    expect((await call("post", "/api/v1/threads/thread-0/like", cookie).expect(200)).body.data).toEqual({
      likes: 1,
      liked: true,
    });
    expect((await call("delete", "/api/v1/threads/thread-0/like", cookie).expect(200)).body.data).toEqual({
      likes: 0,
      liked: false,
    });
    expect((await call("delete", "/api/v1/threads/thread-0/like", cookie).expect(200)).body.data).toEqual({
      likes: 0,
      liked: false,
    });
  });

  it("counts one like per person even when the same user double-taps simultaneously", async () => {
    await seedThreads(1);
    const { cookie } = await createUserWithSession();
    await Promise.all(Array.from({ length: 6 }, () => call("post", "/api/v1/threads/thread-0/like", cookie)));
    expect((await Thread.findOne({ slug: "thread-0" }).lean())?.likes).toBe(1);
    expect(await ThreadLike.countDocuments({ threadId: "thread-0" })).toBe(1);
  });

  it("counts likes from different people", async () => {
    await seedThreads(1);
    const users = await Promise.all([
      createUserWithSession(),
      createUserWithSession(),
      createUserWithSession(),
    ]);
    await Promise.all(
      users.map(({ cookie }) => call("post", "/api/v1/threads/thread-0/like", cookie).expect(200)),
    );
    expect((await Thread.findOne({ slug: "thread-0" }).lean())?.likes).toBe(3);
  });

  it("requires login and an existing thread", async () => {
    await seedThreads(1);
    await call("post", "/api/v1/threads/thread-0/like").expect(401);
    const { cookie } = await createUserWithSession();
    await call("post", "/api/v1/threads/missing/like", cookie).expect(404);
    expect(await ThreadLike.countDocuments()).toBe(0); // no orphan likes
  });
});

describe("replies", () => {
  it("adds replies, keeps replyCount in step, and lists them oldest first with pagination", async () => {
    await seedThreads(1);
    const { cookie } = await createUserWithSession({ name: "Zoya" });
    for (let i = 0; i < 12; i += 1) {
      await call("post", "/api/v1/threads/thread-0/replies", cookie)
        .send({ text: `Reply ${i}` })
        .expect(201);
    }
    expect((await Thread.findOne({ slug: "thread-0" }).lean())?.replyCount).toBe(12);

    const first = await request(app).get("/api/v1/threads/thread-0/replies?limit=5").expect(200);
    expect(first.body.data.map((/** @type {{ text: string }} */ r) => r.text)).toEqual([
      "Reply 0",
      "Reply 1",
      "Reply 2",
      "Reply 3",
      "Reply 4",
    ]);
    expect(first.body.data[0]).toEqual({
      id: expect.any(String),
      author: "Zoya",
      text: "Reply 0",
      at: expect.any(Number),
    });

    const texts = first.body.data.map((/** @type {{ text: string }} */ r) => r.text);
    let cursor = first.body.meta.nextCursor;
    while (cursor) {
      const page = await request(app)
        .get(`/api/v1/threads/thread-0/replies?limit=5&cursor=${cursor}`)
        .expect(200);
      texts.push(...page.body.data.map((/** @type {{ text: string }} */ r) => r.text));
      cursor = page.body.meta.nextCursor;
    }
    expect(texts).toHaveLength(12);
    expect(texts.at(-1)).toBe("Reply 11");
  });

  it("validates replies and requires login, a name and an existing thread", async () => {
    await seedThreads(1);
    await call("post", "/api/v1/threads/thread-0/replies").send({ text: "Hi" }).expect(401);
    const { cookie } = await createUserWithSession();
    await call("post", "/api/v1/threads/thread-0/replies", cookie).send({ text: "" }).expect(400);
    await call("post", "/api/v1/threads/thread-0/replies", cookie)
      .send({ text: "x".repeat(501) })
      .expect(400);
    await call("post", "/api/v1/threads/missing/replies", cookie).send({ text: "Hi" }).expect(404);
    await request(app).get("/api/v1/threads/missing/replies").expect(404);
  });
});

describe("query plans", () => {
  it("the feed, liked lookup and replies use indexes without in-memory sorts", async () => {
    await seedThreads(30);
    await ThreadReply.insertMany(
      Array.from({ length: 10 }, (_, i) => ({ threadId: "thread-0", author: "a", text: `r${i}` })),
    );
    const plans = await Promise.all([
      Thread.find({}).sort({ at: -1, _id: -1 }).limit(21).explain("executionStats"),
      ThreadLike.find({
        userId: "u1",
        threadId: mongoose.trusted({ $in: ["thread-0", "thread-1"] }),
      }).explain("executionStats"),
      ThreadReply.find({ threadId: "thread-0" })
        .sort({ createdAt: 1, _id: 1 })
        .limit(21)
        .explain("executionStats"),
    ]);
    for (const plan of plans) {
      const text = JSON.stringify(/** @type {any} */ (plan).queryPlanner.winningPlan);
      expect(text).toContain("IXSCAN");
      expect(text).not.toContain("COLLSCAN");
      expect(text).not.toContain('"SORT"');
    }
  });
});
