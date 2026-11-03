import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Product } from "../../src/modules/products/product.model.js";
import { TEST_APP_URL, buildTestApp, connectTestDatabase, dropTestDatabase } from "../helpers/test-app.js";
import { createUserWithSession } from "../helpers/users.js";

const { app, env } = buildTestApp();
const PHOTO = "/api/v1/media/0b5c6a0e-1111-4222-8333-444455556666";
const HOUR = 3_600_000;

/** @param {Partial<Record<string, unknown>>} overrides @param {number} i */
const listing = (overrides, i) => ({
  slug: `listing-${i}`,
  title: `Listing ${i}`,
  category: "Jackets",
  size: "M",
  condition: "Good",
  price: 1000 + i,
  mrp: 2000,
  image: PHOTO,
  images: [PHOTO],
  city: "Pune",
  seller: "Seller",
  createdAt: new Date(Date.now() - i * HOUR),
  ...overrides,
});

const validBody = {
  title: "Indigo kantha jacket",
  category: "Jackets",
  size: "M",
  condition: "Like new",
  city: "Kolkata",
  price: 3200,
  mrp: 5400,
  story: "Hand-quilted.",
  exchange: true,
  images: [PHOTO],
};

beforeAll(() => connectTestDatabase(env.MONGODB_URI));
afterAll(() => dropTestDatabase());
beforeEach(() => Product.deleteMany({}));

describe("GET /api/v1/products", () => {
  it("lists active listings newest first with cursor pagination and no repeats", async () => {
    await Product.insertMany(Array.from({ length: 25 }, (_, i) => listing({}, i)));
    await Product.create(listing({ slug: "sold-one", status: "sold" }, 99));

    const first = await request(app).get("/api/v1/products?limit=10").expect(200);
    expect(first.body.data).toHaveLength(10);
    expect(first.body.data[0].id).toBe("listing-0");
    expect(first.body.meta).toEqual({ nextCursor: expect.any(String), limit: 10 });

    const seen = first.body.data.map((/** @type {{ id: string }} */ p) => p.id);
    let cursor = first.body.meta.nextCursor;
    while (cursor) {
      const page = await request(app).get(`/api/v1/products?limit=10&cursor=${cursor}`).expect(200);
      seen.push(...page.body.data.map((/** @type {{ id: string }} */ p) => p.id));
      cursor = page.body.meta.nextCursor;
    }
    expect(seen).toHaveLength(25);
    expect(new Set(seen).size).toBe(25);
    expect(seen).not.toContain("sold-one");
  });

  it("returns public fields only (the seller's public ID, never a phone or email)", async () => {
    await Product.create(
      listing({ sellerId: "0b5c6a0e-1111-4222-8333-444455556666", sellerPhone: "9999999999" }, 1),
    );
    const res = await request(app).get("/api/v1/products").expect(200);
    expect(Object.keys(res.body.data[0]).sort()).toEqual(
      [
        "category",
        "city",
        "condition",
        "createdAt",
        "exchange",
        "id",
        "image",
        "images",
        "mrp",
        "price",
        "seller",
        "sellerId",
        "sellerSlug",
        "size",
        "state",
        "status",
        "story",
        "title",
      ].sort(),
    );
    expect(res.body.data[0].sellerId).toBe("0b5c6a0e-1111-4222-8333-444455556666");
    expect(JSON.stringify(res.body)).not.toContain("9999999999");
  });

  it("filters by city, category, condition, swap and seller", async () => {
    await Product.insertMany([
      listing({ city: "Jaipur", category: "Sarees", sellerSlug: "aarti-rao" }, 1),
      listing({ city: "Jaipur", category: "Skirts", exchange: true, condition: "Excellent" }, 2),
      listing({ city: "Mumbai", category: "Sarees" }, 3),
    ]);
    const ids = async (/** @type {string} */ qs) =>
      (await request(app).get(`/api/v1/products?${qs}`).expect(200)).body.data.map(
        (/** @type {{ id: string }} */ p) => p.id,
      );
    expect(await ids("city=Jaipur")).toEqual(["listing-1", "listing-2"]);
    expect(await ids("category=Sarees")).toEqual(["listing-1", "listing-3"]);
    expect(await ids("city=Jaipur&exchange=true")).toEqual(["listing-2"]);
    expect(await ids("condition=Excellent")).toEqual(["listing-2"]);
    expect(await ids("sellerSlug=aarti-rao")).toEqual(["listing-1"]);
  });

  it("searches titles and stories", async () => {
    await Product.insertMany([
      listing({ title: "Chanderi silk saree" }, 1),
      listing({ title: "Denim jacket", story: "Classic indigo denim" }, 2),
    ]);
    const res = await request(app).get("/api/v1/products?q=denim").expect(200);
    expect(res.body.data.map((/** @type {{ title: string }} */ p) => p.title)).toEqual(["Denim jacket"]);
  });

  it("fetches specific listings by ID in the requested order (including sold ones)", async () => {
    await Product.insertMany([listing({}, 1), listing({ status: "sold" }, 2), listing({}, 3)]);
    const res = await request(app).get("/api/v1/products?ids=listing-3,listing-2,missing").expect(200);
    expect(res.body.data.map((/** @type {{ id: string }} */ p) => p.id)).toEqual(["listing-3", "listing-2"]);
    expect(res.body.meta.nextCursor).toBeNull();
  });

  it("rejects bad filters, oversized limits, too many IDs and tampered cursors", async () => {
    await request(app).get("/api/v1/products?limit=51").expect(400);
    await request(app).get("/api/v1/products?city=London").expect(400);
    await request(app).get("/api/v1/products?unknown=1").expect(400);
    await request(app)
      .get(`/api/v1/products?ids=${Array.from({ length: 51 }, (_, i) => `p${i}`).join(",")}`)
      .expect(400);
    const res = await request(app).get("/api/v1/products?cursor=not-a-cursor").expect(400);
    expect(res.body.error.message).toMatch(/cursor/);
  });
});

describe("GET /api/v1/products/:id", () => {
  it("returns one listing, 404 if missing, 400 for a malformed ID", async () => {
    await Product.create(listing({}, 1));
    expect((await request(app).get("/api/v1/products/listing-1").expect(200)).body.data.title).toBe(
      "Listing 1",
    );
    await request(app).get("/api/v1/products/nope").expect(404);
    await request(app).get("/api/v1/products/BAD_ID!").expect(400);
  });
});

describe("POST /api/v1/products", () => {
  /** @param {string} cookie @param {object} body */
  const create = (cookie, body) =>
    request(app).post("/api/v1/products").set("Origin", TEST_APP_URL).set("Cookie", cookie).send(body);

  it("creates a listing owned by the seller, with the seller's name", async () => {
    const { user, cookie } = await createUserWithSession({ name: "Pooja" });
    const res = await create(cookie, validBody).expect(201);
    expect(res.body.data).toMatchObject({
      title: "Indigo kantha jacket",
      seller: "Pooja",
      image: PHOTO,
      status: "active",
    });
    expect(res.body.data.id).toMatch(/^indigo-kantha-jacket-/);
    expect((await Product.findOne({ slug: res.body.data.id }).lean())?.sellerId).toBe(user.uid);
  });

  it("requires login, a verified phone and the web app's Origin", async () => {
    await request(app).post("/api/v1/products").set("Origin", TEST_APP_URL).send(validBody).expect(401);
    const { cookie } = await createUserWithSession({ phone: null });
    const noPhone = await create(cookie, validBody).expect(403);
    expect(noPhone.body.error.message).toMatch(/verified phone/);
    const seller = await createUserWithSession();
    await request(app)
      .post("/api/v1/products")
      .set("Origin", "https://evil.example")
      .set("Cookie", seller.cookie)
      .send(validBody)
      .expect(403);
  });

  it("validates input, including MRP vs price and photo count", async () => {
    const { cookie } = await createUserWithSession();
    await create(cookie, { ...validBody, title: "x" }).expect(400);
    await create(cookie, { ...validBody, price: 0 }).expect(400);
    await create(cookie, { ...validBody, city: "London" }).expect(400);
    await create(cookie, { ...validBody, mrp: 100 }).expect(400);
    await create(cookie, { ...validBody, images: [] }).expect(400);
    await create(cookie, { ...validBody, images: Array(9).fill(PHOTO) }).expect(400);
    await create(cookie, { ...validBody, sellerId: "someone-else" }).expect(400);
  });

  it("only accepts photos uploaded through Wearistry", async () => {
    const { cookie } = await createUserWithSession();
    const res = await create(cookie, { ...validBody, images: ["https://evil.example/x.jpg"] }).expect(400);
    expect(res.body.error.message).toMatch(/uploaded to Wearistry/);
  });
});

describe("query plans (indexes are actually used)", () => {
  it("browse, city, category, seller and ID lookups use index scans, not collection scans", async () => {
    await Product.insertMany(
      Array.from({ length: 30 }, (_, i) =>
        listing({ city: i % 2 ? "Pune" : "Delhi", sellerSlug: i < 3 ? "aarti-rao" : "" }, i),
      ),
    );
    const plans = await Promise.all(
      [
        { status: "active" },
        { status: "active", city: "Pune" },
        { status: "active", category: "Jackets" },
        { status: "active", sellerSlug: "aarti-rao" },
      ].map((filter) =>
        Product.find(filter).sort({ createdAt: -1, _id: -1 }).limit(21).explain("executionStats"),
      ),
    );
    for (const plan of plans) {
      const text = JSON.stringify(/** @type {any} */ (plan).queryPlanner.winningPlan);
      expect(text).toContain("IXSCAN");
      expect(text).not.toContain("COLLSCAN");
      expect(text).not.toContain('"SORT"'); // the index provides the order; no in-memory sort
    }
  });
});
