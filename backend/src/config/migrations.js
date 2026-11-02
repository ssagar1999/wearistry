import { readdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

/**
 * @typedef {{ id: string, description: string, up: (db: import("mongodb").Db) => Promise<void> }} Migration
 */

/** @typedef {{ _id: string, description: string, appliedAt: Date }} AppliedMigration */

/** @param {import("mongodb").Db} db */
const appliedCollection = (db) =>
  /** @type {import("mongodb").Collection<AppliedMigration>} */ (db.collection("schema_migrations"));

const MIGRATIONS_DIR = path.resolve(import.meta.dirname, "../../migrations");

/**
 * Loads migration files (`NNN-name.js`) in filename order. The number prefix fixes the order forever,
 * so never renumber or edit a migration that has run anywhere; add a new one instead.
 *
 * @param {string} [dir]
 * @returns {Promise<Migration[]>}
 */
export async function loadMigrations(dir = MIGRATIONS_DIR) {
  const files = (await readdir(dir)).filter((file) => /^\d{3}-.+\.js$/.test(file)).sort();
  return Promise.all(files.map(async (file) => import(pathToFileURL(path.join(dir, file)).href)));
}

/**
 * @param {import("mongodb").Db} db
 * @param {Migration[]} migrations
 */
export async function pendingMigrations(db, migrations) {
  const applied = await appliedCollection(db)
    .find({}, { projection: { _id: 1 } })
    .toArray();
  const appliedIds = new Set(applied.map((migration) => migration._id));
  return migrations.filter((migration) => !appliedIds.has(migration.id));
}

/**
 * Applies pending migrations one at a time and records each as soon as it succeeds, so a failure part-way
 * leaves a clear record of what ran. Run from one place at a time (a deploy step), not from every instance.
 *
 * @param {import("mongodb").Db} db
 * @param {Migration[]} migrations
 * @param {(message: string) => void} log
 */
export async function runMigrations(db, migrations, log) {
  const pending = await pendingMigrations(db, migrations);
  for (const migration of pending) {
    log(`Applying ${migration.id}: ${migration.description}`);
    await migration.up(db);
    await appliedCollection(db).insertOne({
      _id: migration.id,
      description: migration.description,
      appliedAt: new Date(),
    });
  }
  return pending.map((migration) => migration.id);
}
