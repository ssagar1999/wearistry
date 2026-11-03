import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Product } from "../../src/modules/products/product.model.js";
import { SwapRequest } from "../../src/modules/swaps/swap-request.model.js";
import { User } from "../../src/modules/users/user.model.js";
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

/** A seller, their swappable listing, and a buyer who may request it. */
async function setup() {
  const owner = await createUserWithSession({ name: "Aarti", phone: "9811111111" });
  const requester = await createUserWithSession({ name: "Kabir", phone: "9822222222" });
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
    sellerId: owner.user.uid,
    exchange: true,
  });
  return { owner, requester };
}

const body = { productId: "dabu-skirt", offer: "Block-print kurta, size M", note: "Can meet in Jaipur" };

beforeAll(() => connectTestDatabase(env.MONGODB_URI));
afterAll(() => dropTestDatabase());
beforeEach(() => Promise.all([Product.deleteMany({}), SwapRequest.deleteMany({}), User.deleteMany({})]));

describe("POST /api/v1/swap-requests", () => {
  it("sends a request, copying names and the listing's title and photo", async () => {
    const { requester } = await setup();
    const res = await call("post", "/api/v1/swap-requests", requester.cookie).send(body).expect(201);
    expect(res.body.data).toMatchObject({
      product: { id: "dabu-skirt", title: "Dabu skirt", image: PHOTO },
      offer: "Block-print kurta, size M",
      status: "pending",
      counterpart: { name: "Aarti" },
      contactPhone: null,
    });
  });

  it("rejects your own listing, listings not open to swaps, sold or missing listings, and ones without an owner", async () => {
    const { owner, requester } = await setup();
    await call("post", "/api/v1/swap-requests", owner.cookie).send(body).expect(400);

    await Product.updateOne({ slug: "dabu-skirt" }, { $set: { exchange: false } });
    const closed = await call("post", "/api/v1/swap-requests", requester.cookie).send(body).expect(400);
    expect(closed.body.error.message).toMatch(/hasn't opened/);

    await Product.updateOne({ slug: "dabu-skirt" }, { $set: { exchange: true, status: "sold" } });
    await call("post", "/api/v1/swap-requests", requester.cookie).send(body).expect(404);
    await call("post", "/api/v1/swap-requests", requester.cookie)
      .send({ ...body, productId: "nope" })
      .expect(404);

    await Product.create({
      slug: "curated",
      title: "T",
      category: "Tops",
      size: "M",
      condition: "Good",
      price: 9,
      image: PHOTO,
      images: [PHOTO],
      city: "Pune",
      seller: "Shop",
      exchange: true,
    });
    await call("post", "/api/v1/swap-requests", requester.cookie)
      .send({ ...body, productId: "curated" })
      .expect(400);
  });

  it("allows only one pending request per person per listing, even with simultaneous taps", async () => {
    const { requester } = await setup();
    const results = await Promise.all(
      Array.from({ length: 6 }, () => call("post", "/api/v1/swap-requests", requester.cookie).send(body)),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(5);
    expect(await SwapRequest.countDocuments()).toBe(1);
  });

  it("lets you ask again after the earlier request is no longer pending", async () => {
    const { requester } = await setup();
    const first = await call("post", "/api/v1/swap-requests", requester.cookie).send(body).expect(201);
    await call("patch", `/api/v1/swap-requests/${first.body.data.id}`, requester.cookie)
      .send({ action: "cancel" })
      .expect(200);
    await call("post", "/api/v1/swap-requests", requester.cookie).send(body).expect(201);
  });

  it("requires login, a verified phone, valid input and the web app's Origin", async () => {
    const { requester } = await setup();
    await call("post", "/api/v1/swap-requests").send(body).expect(401);
    const noPhone = await createUserWithSession({ phone: null });
    await call("post", "/api/v1/swap-requests", noPhone.cookie).send(body).expect(403);
    await call("post", "/api/v1/swap-requests", requester.cookie)
      .send({ ...body, offer: "x" })
      .expect(400);
    await call("post", "/api/v1/swap-requests", requester.cookie)
      .send({ ...body, ownerId: "someone" })
      .expect(400);
    await request(app)
      .post("/api/v1/swap-requests")
      .set("Origin", "https://evil.example")
      .set("Cookie", requester.cookie)
      .send(body)
      .expect(403);
  });
});

describe("GET /api/v1/swap-requests", () => {
  it("shows each person only their own received and sent requests, newest first, with pagination", async () => {
    const { owner, requester } = await setup();
    const third = await createUserWithSession();
    for (let i = 0; i < 3; i += 1) {
      await Product.create({
        slug: `p-${i}`,
        title: `P${i}`,
        category: "Tops",
        size: "M",
        condition: "Good",
        price: 5,
        image: PHOTO,
        images: [PHOTO],
        city: "Pune",
        seller: "Aarti",
        sellerId: owner.user.uid,
        exchange: true,
      });
      await call("post", "/api/v1/swap-requests", requester.cookie)
        .send({ ...body, productId: `p-${i}` })
        .expect(201);
    }

    const received = await call("get", "/api/v1/swap-requests?box=received&limit=2", owner.cookie).expect(
      200,
    );
    expect(received.body.data.map((/** @type {{ product: { id: string } }} */ r) => r.product.id)).toEqual([
      "p-2",
      "p-1",
    ]);
    expect(received.body.data[0].counterpart.name).toBe("Kabir");
    const more = await call(
      "get",
      `/api/v1/swap-requests?box=received&limit=2&cursor=${received.body.meta.nextCursor}`,
      owner.cookie,
    ).expect(200);
    expect(more.body.data.map((/** @type {{ product: { id: string } }} */ r) => r.product.id)).toEqual([
      "p-0",
    ]);

    const sent = await call("get", "/api/v1/swap-requests?box=sent", requester.cookie).expect(200);
    expect(sent.body.data).toHaveLength(3);
    expect(sent.body.data[0].counterpart.name).toBe("Aarti");

    expect(
      (await call("get", "/api/v1/swap-requests?box=received", third.cookie).expect(200)).body.data,
    ).toHaveLength(0);
    expect(
      (await call("get", "/api/v1/swap-requests?box=sent", owner.cookie).expect(200)).body.data,
    ).toHaveLength(0);
  });

  it("requires login and a valid box", async () => {
    const { owner } = await setup();
    await call("get", "/api/v1/swap-requests").expect(401);
    await call("get", "/api/v1/swap-requests?box=everyone", owner.cookie).expect(400);
  });

  it("uses the inbox indexes (no collection scan, no in-memory sort)", async () => {
    const { owner, requester } = await setup();
    await call("post", "/api/v1/swap-requests", requester.cookie).send(body).expect(201);
    for (const filter of [{ ownerId: owner.user.uid }, { requesterId: requester.user.uid }]) {
      const plan = await SwapRequest.find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .limit(21)
        .explain("executionStats");
      const text = JSON.stringify(/** @type {any} */ (plan).queryPlanner.winningPlan);
      expect(text).toContain("IXSCAN");
      expect(text).not.toContain("COLLSCAN");
      expect(text).not.toContain('"SORT"');
    }
  });
});

describe("PATCH /api/v1/swap-requests/:id", () => {
  async function pending() {
    const ctx = await setup();
    const res = await call("post", "/api/v1/swap-requests", ctx.requester.cookie).send(body).expect(201);
    return { ...ctx, id: /** @type {string} */ (res.body.data.id) };
  }

  it("accept reveals each person's phone to the other, and only then", async () => {
    const { owner, requester, id } = await pending();
    const before = await call("get", "/api/v1/swap-requests?box=received", owner.cookie).expect(200);
    expect(before.body.data[0].contactPhone).toBeNull();

    const accepted = await call("patch", `/api/v1/swap-requests/${id}`, owner.cookie)
      .send({ action: "accept" })
      .expect(200);
    expect(accepted.body.data).toMatchObject({ status: "accepted", contactPhone: "9822222222" }); // the requester's phone

    const sent = await call("get", "/api/v1/swap-requests?box=sent", requester.cookie).expect(200);
    expect(sent.body.data[0]).toMatchObject({ status: "accepted", contactPhone: "9811111111" }); // the owner's phone
  });

  it("decline and cancel work and reveal nothing", async () => {
    const { owner, requester, id } = await pending();
    const declined = await call("patch", `/api/v1/swap-requests/${id}`, owner.cookie)
      .send({ action: "decline" })
      .expect(200);
    expect(declined.body.data).toMatchObject({ status: "declined", contactPhone: null });

    const again = await call("post", "/api/v1/swap-requests", requester.cookie).send(body).expect(201);
    const cancelled = await call("patch", `/api/v1/swap-requests/${again.body.data.id}`, requester.cookie)
      .send({ action: "cancel" })
      .expect(200);
    expect(cancelled.body.data).toMatchObject({ status: "cancelled", contactPhone: null });
  });

  it("enforces who may do what: only the owner accepts or declines, only the requester cancels", async () => {
    const { owner, requester, id } = await pending();
    await call("patch", `/api/v1/swap-requests/${id}`, requester.cookie)
      .send({ action: "accept" })
      .expect(403);
    await call("patch", `/api/v1/swap-requests/${id}`, requester.cookie)
      .send({ action: "decline" })
      .expect(403);
    await call("patch", `/api/v1/swap-requests/${id}`, owner.cookie).send({ action: "cancel" }).expect(403);
    expect((await SwapRequest.findById(id).lean())?.status).toBe("pending");
  });

  it("tells strangers nothing, and rejects anonymous callers and bad IDs", async () => {
    const { id } = await pending();
    const stranger = await createUserWithSession();
    await call("patch", `/api/v1/swap-requests/${id}`, stranger.cookie)
      .send({ action: "accept" })
      .expect(404);
    await call("patch", `/api/v1/swap-requests/${id}`).send({ action: "accept" }).expect(401);
    await call("patch", "/api/v1/swap-requests/not-an-id", stranger.cookie)
      .send({ action: "accept" })
      .expect(400);
    await call("patch", "/api/v1/swap-requests/aaaaaaaaaaaaaaaaaaaaaaaa", stranger.cookie)
      .send({ action: "accept" })
      .expect(404);
  });

  it("only a pending request can change, even when decisions arrive at the same time", async () => {
    const { owner, requester, id } = await pending();
    const results = await Promise.all([
      call("patch", `/api/v1/swap-requests/${id}`, owner.cookie).send({ action: "accept" }),
      call("patch", `/api/v1/swap-requests/${id}`, owner.cookie).send({ action: "decline" }),
      call("patch", `/api/v1/swap-requests/${id}`, requester.cookie).send({ action: "cancel" }),
    ]);
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    const final = (await SwapRequest.findById(id).lean())?.status;
    expect(["accepted", "declined", "cancelled"]).toContain(final);

    const late = await call("patch", `/api/v1/swap-requests/${id}`, owner.cookie).send({
      action: final === "accepted" ? "decline" : "accept",
    });
    expect(late.status).toBe(409);
  });
});
