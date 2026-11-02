import express from "express";
import mongoose from "mongoose";
import pino from "pino";
import { pinoHttp } from "pino-http";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { errorHandler } from "../../src/middleware/error.middleware.js";
import { requestId } from "../../src/middleware/request-id.middleware.js";
import { validate } from "../../src/middleware/validate.middleware.js";
import { ApiError } from "../../src/utils/api-error.js";
import { connectTestDatabase, dropTestDatabase, testEnv } from "../helpers/test-app.js";

// A tiny app wired with the real middleware, plus routes that fail in specific ways.
const Item = mongoose.model("Item", new mongoose.Schema({ sku: { type: String, unique: true } }));

const app = express();
app.use(requestId);
app.use(pinoHttp({ logger: pino({ level: "silent" }) }));
app.use(express.json());
app.post("/items", validate({ body: z.object({ sku: z.string().min(3) }).strict() }), async (req, res) => {
  const body = /** @type {{ sku: string }} */ (req.validated?.body);
  const item = await Item.create(body);
  res.status(201).json({ data: { sku: item.sku } });
});
app.get("/items/:id", async (req, res) => {
  const item = await Item.findById(req.params.id);
  if (!item) throw ApiError.notFound("Item not found.");
  res.json({ data: item });
});
app.get("/boom", async () => {
  throw new Error("secret internal detail");
});
app.use(errorHandler);

describe("centralized error handling", () => {
  beforeAll(async () => {
    await connectTestDatabase(testEnv().MONGODB_URI);
  });
  afterAll(() => dropTestDatabase());

  it("creates a valid record", async () => {
    const res = await request(app).post("/items").send({ sku: "KURTA-1" }).expect(201);
    expect(res.body).toEqual({ data: { sku: "KURTA-1" } });
  });

  it("returns 400 with field details for missing or invalid fields", async () => {
    const missing = await request(app).post("/items").send({}).expect(400);
    expect(missing.body.error.code).toBe("VALIDATION_ERROR");
    expect(missing.body.error.details[0].path).toBe("sku");

    await request(app).post("/items").send({ sku: "ab" }).expect(400);
  });

  it("blocks NoSQL operator injection in the body", async () => {
    await request(app)
      .post("/items")
      .send({ sku: { $ne: null } })
      .expect(400);
  });

  it("returns 409 CONFLICT for duplicate records", async () => {
    await request(app).post("/items").send({ sku: "SAREE-1" }).expect(201);
    const res = await request(app).post("/items").send({ sku: "SAREE-1" }).expect(409);
    expect(res.body.error).toMatchObject({ code: "CONFLICT", details: { fields: ["sku"] } });
  });

  it("returns 404 from a thrown ApiError and 400 for a malformed ObjectId", async () => {
    await request(app).get(`/items/${new mongoose.Types.ObjectId()}`).expect(404);
    await request(app).get("/items/not-an-object-id").expect(400);
  });

  it("returns a generic 500 without leaking internals for unexpected errors", async () => {
    const res = await request(app).get("/boom").expect(500);
    expect(res.body.error.code).toBe("INTERNAL_ERROR");
    expect(JSON.stringify(res.body)).not.toContain("secret internal detail");
    expect(res.body.error.requestId).toBeDefined();
  });

  it("returns 500 when the database is unavailable", async () => {
    await mongoose.disconnect();
    const res = await request(app).post("/items").send({ sku: "DUPATTA-1" });
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe("INTERNAL_ERROR");
    await connectTestDatabase(testEnv().MONGODB_URI);
  });
});
