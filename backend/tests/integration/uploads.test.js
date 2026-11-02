import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TEST_APP_URL, buildTestApp, connectTestDatabase, dropTestDatabase } from "../helpers/test-app.js";
import { createUserWithSession } from "../helpers/users.js";

const uploadDir = await mkdtemp(path.join(os.tmpdir(), "wearistry-uploads-"));
const { app, env } = buildTestApp({ UPLOAD_DIR: uploadDir });

/** A 2400×1600 landscape JPEG with an EXIF "rotate 90°" flag and a GPS position, like a phone photo. */
async function phonePhoto() {
  return sharp({ create: { width: 2400, height: 1600, channels: 3, background: { r: 180, g: 90, b: 60 } } })
    .jpeg({ quality: 90 })
    .withExif({ IFD0: { Make: "TestPhone" }, IFD3: { GPSLatitudeRef: "N", GPSLatitude: "19/1 4/1 0/1" } })
    .withMetadata({ orientation: 6 })
    .toBuffer();
}

/** @param {string} cookie @param {Buffer} file @param {string} [name] */
const upload = (cookie, file, name = "photo.jpg") =>
  request(app)
    .post("/api/v1/uploads")
    .set("Origin", TEST_APP_URL)
    .set("Cookie", cookie)
    .attach("file", file, name);

beforeAll(() => connectTestDatabase(env.MONGODB_URI));
afterAll(async () => {
  await dropTestDatabase();
  await rm(uploadDir, { recursive: true, force: true });
});

describe("photo uploads", () => {
  it("stores three WebP sizes, upright, with all metadata (including GPS) removed", async () => {
    const { cookie } = await createUserWithSession();
    const res = await upload(cookie, await phonePhoto()).expect(201);
    expect(res.body.data.url).toMatch(/^\/api\/v1\/media\/[0-9a-f-]{36}$/);

    for (const width of [480, 960, 1600]) {
      const file = await request(app).get(`${res.body.data.url}-${width}.webp`).expect(200);
      expect(file.headers["content-type"]).toBe("image/webp");
      expect(file.headers["cache-control"]).toBe("public, max-age=31536000, immutable");
      const meta = await sharp(file.body).metadata();
      expect(meta.width).toBe(width);
      expect(meta.height).toBeGreaterThan(meta.width ?? 0); // rotated: the landscape original is now portrait
      expect(meta.exif).toBeUndefined();
    }
  });

  it("never enlarges small photos", async () => {
    const { cookie } = await createUserWithSession();
    const small = await sharp({ create: { width: 600, height: 900, channels: 3, background: "#ccc" } })
      .jpeg()
      .toBuffer();
    const res = await upload(cookie, small).expect(201);
    const large = await request(app).get(`${res.body.data.url}-1600.webp`).expect(200);
    expect((await sharp(large.body).metadata()).width).toBe(600);
  });

  it("requires login and the web app's Origin", async () => {
    const photo = await phonePhoto();
    await request(app)
      .post("/api/v1/uploads")
      .set("Origin", TEST_APP_URL)
      .attach("file", photo, "a.jpg")
      .expect(401);
    const { cookie } = await createUserWithSession();
    await request(app)
      .post("/api/v1/uploads")
      .set("Origin", "https://evil.example")
      .set("Cookie", cookie)
      .attach("file", photo, "a.jpg")
      .expect(403);
  });

  it("rejects files that aren't images, missing files and files over 15 MB", async () => {
    const { cookie } = await createUserWithSession();
    const fake = await upload(cookie, Buffer.from("not really a jpeg"), "fake.jpg").expect(400);
    expect(fake.body.error.message).toMatch(/JPG, PNG or WebP/);

    await request(app).post("/api/v1/uploads").set("Origin", TEST_APP_URL).set("Cookie", cookie).expect(400);

    const tooBig = await upload(cookie, Buffer.alloc(15 * 1024 * 1024 + 1), "big.jpg").expect(413);
    expect(tooBig.body.error.code).toBe("PAYLOAD_TOO_LARGE");
  });

  it("serves only well-formed photo names (no path traversal)", async () => {
    await request(app).get("/api/v1/media/..%2F..%2Fpackage.json").expect(404);
    await request(app).get("/api/v1/media/0b5c6a0e-1111-4222-8333-444455556666-960.webp").expect(404);
  });
});
