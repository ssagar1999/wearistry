import { MongoMemoryServer } from "mongodb-memory-server";

/** @type {MongoMemoryServer | undefined} */
let mongo;

/** @param {import("vitest/node").TestProject} project */
export async function setup(project) {
  mongo = await MongoMemoryServer.create();
  project.provide("mongoUri", mongo.getUri());
}

export async function teardown() {
  await mongo?.stop();
}
