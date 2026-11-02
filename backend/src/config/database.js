import mongoose from "mongoose";

// Reject query filters on fields that aren't in the schema instead of silently ignoring them.
mongoose.set("strictQuery", true);
// Wraps operator-looking values (e.g. { $gt: "" }) sent by clients so they are treated as plain values,
// a second line of defence against NoSQL injection behind Zod validation.
mongoose.set("sanitizeFilter", true);
// Fail queries immediately while disconnected instead of queueing them for up to 10s. Requests get a
// fast error (and /health/ready reports "down") rather than hanging during an outage.
mongoose.set("bufferCommands", false);
// Models are imported before the connection exists, so Mongoose must not try to create collections or
// indexes at import time. connectDatabase() creates indexes explicitly once connected.
mongoose.set("autoCreate", false);
mongoose.set("autoIndex", false);

/**
 * Connects once at startup. The process should not serve traffic without a database,
 * so connection failures are thrown to the caller (server.js), which exits.
 *
 * @param {string} uri
 * @param {import("pino").Logger} logger
 */
export async function connectDatabase(uri, logger) {
  const connection = mongoose.connection;
  connection.on("disconnected", () => logger.warn("MongoDB disconnected"));
  connection.on("reconnected", () => logger.info("MongoDB reconnected"));
  connection.on("error", (error) => logger.error({ err: error }, "MongoDB connection error"));

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10_000 });
  logger.info({ database: connection.name }, "MongoDB connected");
  await ensureIndexes(logger);
}

/**
 * Creates any index declared in a schema that doesn't exist yet. This never drops or changes existing
 * indexes (unlike syncIndexes), and is a cheap no-op when everything already exists. MongoDB builds new
 * indexes without blocking reads and writes, but a large new index on a big collection should still be
 * planned and created deliberately (see docs/DATABASE.md).
 *
 * @param {import("pino").Logger} logger
 */
async function ensureIndexes(logger) {
  const models = Object.values(mongoose.models);
  try {
    await Promise.all(models.map((model) => model.createIndexes()));
  } catch (error) {
    // Usually an existing index with different options; changing an index is a migration, not a startup task.
    throw new Error("Could not create indexes. If a schema index changed, run `npm run migrate` first.", {
      cause: error,
    });
  }
  if (models.length) logger.info({ models: models.map((model) => model.modelName) }, "Indexes ensured");
}

export async function disconnectDatabase() {
  // A deliberate disconnect (shutdown, tests) shouldn't log the "disconnected" warning meant for outages.
  mongoose.connection.removeAllListeners("disconnected");
  await mongoose.disconnect();
}

export function isDatabaseConnected() {
  return mongoose.connection.readyState === mongoose.ConnectionStates.connected;
}
