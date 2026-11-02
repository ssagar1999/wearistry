import http from "node:http";
import { createApp } from "./app.js";
import { connectDatabase, disconnectDatabase } from "./config/database.js";
import { EnvValidationError, parseEnv } from "./config/env.js";
import { createLogger } from "./config/logger.js";

// Gives in-flight requests time to finish on shutdown before the process is forced to exit.
const SHUTDOWN_TIMEOUT_MS = 10_000;

function loadEnvOrExit() {
  try {
    return parseEnv(process.env);
  } catch (error) {
    if (error instanceof EnvValidationError) {
      // The logger depends on env, so this one message goes straight to stderr.
      console.error(error.message);
      process.exit(1);
    }
    throw error;
  }
}

const env = loadEnvOrExit();
const logger = createLogger(env);

// After an unexpected error the process may be in an unknown state; log it and exit so the
// process manager (Docker, systemd, etc.) restarts a clean instance.
process.on("unhandledRejection", (reason) => {
  logger.fatal({ err: reason }, "Unhandled promise rejection");
  process.exit(1);
});
process.on("uncaughtException", (error) => {
  logger.fatal({ err: error }, "Uncaught exception");
  process.exit(1);
});

try {
  await connectDatabase(env.MONGODB_URI, logger);
} catch (error) {
  logger.fatal({ err: error }, "Could not connect to MongoDB; exiting");
  process.exit(1);
}

const server = http.createServer(createApp({ env, logger }));
server.listen(env.PORT, () => logger.info({ port: env.PORT, env: env.NODE_ENV }, "API listening"));

let shuttingDown = false;

/** @param {NodeJS.Signals} signal */
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "Shutting down");

  const forceExit = setTimeout(() => {
    logger.error("Shutdown timed out; forcing exit");
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceExit.unref();

  try {
    // Stop accepting new connections and wait for open requests to finish, then close the DB.
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve(undefined))),
    );
    await disconnectDatabase();
    logger.info("Shutdown complete");
    process.exit(0);
  } catch (error) {
    logger.error({ err: error }, "Error during shutdown");
    process.exit(1);
  }
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
