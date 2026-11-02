// Usage: npm run migrate          apply pending migrations
//        npm run migrate:status   list pending migrations without changing anything
import mongoose from "mongoose";
import { parseEnv } from "../src/config/env.js";
import { loadMigrations, pendingMigrations, runMigrations } from "../src/config/migrations.js";

const command = process.argv[2] ?? "up";
const env = parseEnv(process.env);

// Connects without the app's startup index creation: migrations may need to fix an index first.
await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 10_000 });
const db = /** @type {import("mongodb").Db} */ (mongoose.connection.db);

try {
  const migrations = await loadMigrations();
  if (command === "status") {
    const pending = await pendingMigrations(db, migrations);
    console.error(pending.length ? `Pending:\n  ${pending.map((m) => m.id).join("\n  ")}` : "Up to date.");
  } else if (command === "up") {
    const applied = await runMigrations(db, migrations, (message) => console.error(message));
    console.error(applied.length ? `Applied ${applied.length} migration(s).` : "Up to date.");
  } else {
    console.error(`Unknown command "${command}". Use "up" or "status".`);
    process.exitCode = 1;
  }
} finally {
  await mongoose.disconnect();
}
