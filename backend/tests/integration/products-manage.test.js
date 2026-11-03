import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Product } from "../../src/modules/products/product.model.js";
import { ThreadLike } from "../../src/modules/threads/thread-like.model.js";
import { Thread } from "../../src/modules/threads/thread.model.js";
import { TEST_APP_URL, buildTestApp, connectTestDatabase, dropTestDatabase } from "../helpers/test-app.js";
import { createUserWithSession } from "../helpers/users.js";

const { app, env } = buildTestApp();
const PHOTO = "/api/v1/media/0b5c6a0e-1111-4222-8333-444455556666";
const HOUR = 3_600_000;

/** @param {string} method @param {string} path @param {string} [cookie] */
function call(method, path, cookie) {
  const req = /** @type {import("supertest").Test} */ (
    /** @type {any} */ (request(app))[method](path).set("Origin", TEST_APP_URL)
  );
  return cookie ? req.set("Cookie", cookie) : req;
}

/** @param {string} slug @param {Record<string, unknown>} [overrides] */
const listing = (slug, overrides = {}) => ({
  slug,
  title: `Title ${slug}`,
  category: "Jackets",
  size: "M",
  condition: "Good",
  price: 1000,
  mrp: 2000,
  image: PHOTO,
  images: [PHOTO],
  city: "Pune",
  seller: "Seller",
  ...overrides,
});

beforeAll(() => connectTestDatabase(env.MONGODB_URI));
afterAll(() => dropTestDatabase());
beforeEach(() => Promise.all([Product.deleteMany({}), Thread.deleteMany({}), ThreadLike.deleteMany({})]));

describe("GET /api/v1/products/mine", () => {
  it("lists only my listings, newest first, including sold ones but not removed ones, with pagination", async () => {
    const me = await createUserWithSession();
    const other = await createUserWithSession();
    await Product.insertMany([
      ...Array.from({ length: 7 }, (_, i) =>
        listing(`mine-${i}`, { sellerId: me.user.uid, createdAt: new Date(Date.now() - i * HOUR) }),
      ),
      listing("mine-sold", {
        sellerId: me.user.uid,
        status: "sold",
        createdAt: new Date(Date.now() - 20 * HOUR),
      }),
      listing("mine-removed", { sellerId: me.user.uid, status: "removed" }),
      listing("theirs", { sellerId: other.user.uid }),
    ]);

    const first = await call("get", "/api/v1/products/mine?limit=5", me.cookie).expect(200);
    const ids = first.body.data.map((/** @type {{ id: string }} */ p) => p.id);
    expect(ids).toEqual(["mine-0", "mine-1", "mine-2", "mine-3", "mine-4"]);
    const second = await call(
      "get",
      `/api/v1/products/mine?limit=5&cursor=${first.body.meta.nextCursor}`,
      me.cookie,
    ).expect(200);
    expect(second.body.data.map((/** @type {{ id: string }} */ p) => p.id)).toEqual([
      "mine-5",
      "mine-6",
      "mine-sold",
    ]);
    expect(second.body.meta.nextCursor).toBeNull();
  });

  it("requires login", async () => {
    await call("get", "/api/v1/products/mine").expect(401);
  });
});

describe("filtering by seller", () => {
  it("lists a seller's active listings by their public ID", async () => {
    const { user } = await createUserWithSession();
    await Product.insertMany([
      listing("a", { sellerId: user.uid }),
      listing("b", { sellerId: user.uid, status: "sold" }),
      listing("c"),
    ]);
    const res = await request(app).get(`/api/v1/products?sellerId=${user.uid}`).expect(200);
    expect(res.body.data.map((/** @type {{ id: string }} */ p) => p.id)).toEqual(["a"]);
    await request(app).get("/api/v1/products?sellerId=not-a-uuid").expect(400);
  });
});

describe("PATCH /api/v1/products/:id", () => {
  it("updates the state when the city changes", async () => {
    const { user, cookie } = await createUserWithSession();
    await Product.create(listing("moving", { sellerId: user.uid, city: "Pune", state: "Maharashtra" }));
    const res = await call("patch", "/api/v1/products/moving", cookie).send({ city: "Jaipur" }).expect(200);
    expect(res.body.data).toMatchObject({ city: "Jaipur", state: "Rajasthan" });
  });

  it("lets the owner change fields and mark a piece sold, which hides it from browse", async () => {
    const { user, cookie } = await createUserWithSession();
    await Product.create(listing("my-item", { sellerId: user.uid }));

    const res = await call("patch", "/api/v1/products/my-item", cookie)
      .send({ price: 800, story: "Now cheaper", exchange: true })
      .expect(200);
    expect(res.body.data).toMatchObject({
      price: 800,
      story: "Now cheaper",
      exchange: true,
      title: "Title my-item",
    });

    await call("patch", "/api/v1/products/my-item", cookie).send({ status: "sold" }).expect(200);
    const browse = await request(app).get("/api/v1/products").expect(200);
    expect(browse.body.data).toHaveLength(0);
    expect((await request(app).get("/api/v1/products/my-item").expect(200)).body.data.status).toBe("sold");
  });

  it("checks the original price against the price, including the stored one", async () => {
    const { user, cookie } = await createUserWithSession();
    await Product.create(listing("my-item", { sellerId: user.uid, price: 1000, mrp: 2000 }));
    await call("patch", "/api/v1/products/my-item", cookie).send({ price: 3000 }).expect(400);
    await call("patch", "/api/v1/products/my-item", cookie).send({ mrp: 500 }).expect(400);
    await call("patch", "/api/v1/products/my-item", cookie).send({ price: 1500, mrp: 2500 }).expect(200);
  });

  it("refuses other people's listings (403), curated listings without an owner, and missing ones (404)", async () => {
    const owner = await createUserWithSession();
    const stranger = await createUserWithSession();
    await Product.insertMany([listing("owned", { sellerId: owner.user.uid }), listing("curated")]);
    await call("patch", "/api/v1/products/owned", stranger.cookie).send({ price: 1 }).expect(403);
    await call("patch", "/api/v1/products/curated", stranger.cookie).send({ price: 1 }).expect(403);
    await call("patch", "/api/v1/products/nope", stranger.cookie).send({ price: 1 }).expect(404);
    expect((await Product.findOne({ slug: "owned" }).lean())?.price).toBe(1000); // untouched
  });

  it("validates input: unknown fields, owner changes, empty bodies and bad values", async () => {
    const { user, cookie } = await createUserWithSession();
    await Product.create(listing("my-item", { sellerId: user.uid }));
    for (const body of [
      {},
      { sellerId: "someone-else" },
      { images: [] },
      { price: 0 },
      { city: "London" },
      { status: "removed" },
      { title: "x" },
    ]) {
      await call("patch", "/api/v1/products/my-item", cookie).send(body).expect(400);
    }
  });

  it("requires login and the web app's Origin", async () => {
    const { user, cookie } = await createUserWithSession();
    await Product.create(listing("my-item", { sellerId: user.uid }));
    await call("patch", "/api/v1/products/my-item").send({ price: 5 }).expect(401);
    await request(app)
      .patch("/api/v1/products/my-item")
      .set("Origin", "https://evil.example")
      .set("Cookie", cookie)
      .send({ price: 5 })
      .expect(403);
  });
});

describe("DELETE /api/v1/products/:id (soft delete)", () => {
  it("hides the listing everywhere but erases nothing", async () => {
    const { user, cookie } = await createUserWithSession();
    await Product.create(listing("my-item", { sellerId: user.uid }));
    await Thread.create({
      slug: "t1",
      author: "A",
      text: "Look at this",
      productId: "my-item",
      at: Date.now(),
    });

    await call("delete", "/api/v1/products/my-item", cookie).expect(204);

    await request(app).get("/api/v1/products/my-item").expect(404);
    expect((await request(app).get("/api/v1/products").expect(200)).body.data).toHaveLength(0);
    expect((await request(app).get("/api/v1/products?ids=my-item").expect(200)).body.data).toHaveLength(0);
    expect((await call("get", "/api/v1/products/mine", cookie).expect(200)).body.data).toHaveLength(0);
    // A thread that mentioned it simply loses its card.
    expect((await request(app).get("/api/v1/threads").expect(200)).body.data[0].product).toBeNull();
    // Still in the database.
    expect((await Product.findOne({ slug: "my-item" }).lean())?.status).toBe("removed");
    // Can't edit or remove it again.
    await call("patch", "/api/v1/products/my-item", cookie).send({ price: 5 }).expect(404);
    await call("delete", "/api/v1/products/my-item", cookie).expect(404);
  });

  it("refuses non-owners and anonymous visitors", async () => {
    const owner = await createUserWithSession();
    const stranger = await createUserWithSession();
    await Product.create(listing("owned", { sellerId: owner.user.uid }));
    await call("delete", "/api/v1/products/owned").expect(401);
    await call("delete", "/api/v1/products/owned", stranger.cookie).expect(403);
    expect((await Product.findOne({ slug: "owned" }).lean())?.status).toBe("active");
  });
});

describe("GET /api/v1/users/:id (public profile)", () => {
  it("shows name, city, verification and join date, but never phone or email", async () => {
    const { user } = await createUserWithSession({ name: "Pooja Varma", city: "Kolkata" });
    const res = await request(app).get(`/api/v1/users/${user.uid}`).expect(200);
    expect(res.body.data).toEqual({
      id: user.uid,
      name: "Pooja Varma",
      city: "Kolkata",
      avatarUrl: null,
      verified: true,
      memberSince: expect.any(String),
    });
    expect(JSON.stringify(res.body)).not.toContain(String(user.phone));
  });

  it("marks sellers without a verified phone as unverified, hides nameless accounts, and rejects bad IDs", async () => {
    const unverified = await createUserWithSession({ phone: null });
    expect(
      (await request(app).get(`/api/v1/users/${unverified.user.uid}`).expect(200)).body.data.verified,
    ).toBe(false);
    const nameless = await createUserWithSession({ name: "" });
    await request(app).get(`/api/v1/users/${nameless.user.uid}`).expect(404);
    await request(app).get("/api/v1/users/0b5c6a0e-1111-4222-8333-444455556666").expect(404);
    await request(app).get("/api/v1/users/me").expect(400);
  });
});
