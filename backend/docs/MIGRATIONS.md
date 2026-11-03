# Migrations

MongoDB doesn't enforce a schema, but our code and indexes do. Any change that existing data or existing indexes must follow ships as a **versioned migration**.

## Commands

```bash
npm run migrate:status   # list pending migrations; changes nothing
npm run migrate          # apply pending migrations, in order
```

Both read `MONGODB_URI` from `.env` (or the environment).

## How it works

- **Migrations are files in `backend/migrations/` named `NNN-short-name.js`.** The 3-digit number fixes the order forever.
- **Each file exports `id`, `description` and `async up(db)`,** where `db` is the native MongoDB driver database.
- **The runner** (`src/config/migrations.js`) applies pending files one at a time and records each in the `schema_migrations` collection (`_id` = migration id, `appliedAt`) **as soon as it succeeds**. If one fails, everything before it stays recorded, and rerunning resumes at the failed one.
- **The runner connects without the app's startup index creation,** because a migration may need to fix an index the app's schema would otherwise conflict with.
- **App startup never runs migrations.** If a schema index changed and the migration hasn't run, startup fails with a clear message ("run `npm run migrate` first") instead of silently changing production indexes.

## Writing a migration

1. **Copy the newest file, bump the number,** and write `up(db)`.
2. **Make it idempotent:** safe to run twice. Check the current state first. For example, drop an index only if it exists with the old options, and backfill only documents that are missing the field.
3. **Process large backfills in batches,** for example `updateMany` with a filter that excludes already-migrated documents. Don't load whole collections into memory.
4. **Add a test** in `tests/integration/migrations.test.js` that sets up the _old_ shape, runs the migration, checks the new shape, and runs it again to prove it's idempotent.
5. **Never edit or renumber a migration that has run anywhere.** Fix mistakes with a new migration.
6. **Document destructive or irreversible steps** in the file's header comment: what is dropped, and how to restore it.

## Backward-compatible change process

Old and new app versions may run side by side during a deploy, so:

1. **Expand:** add the new field or index as optional. The new code reads both the old and new shapes.
2. **Migrate:** backfill existing documents with a migration.
3. **Contract:** once every instance runs the new code, make the field required or remove the old field, using another migration.

Never rename or remove a production field in a single step, and never silently change what an existing field means.

## Deploy order

```bash
npm run migrate:status   # review what will run
npm run migrate          # apply (one machine, once)
# then deploy and start the new app version
```

- **Run migrations from one place,** such as a deploy step or your machine, not from every instance.
- **Before a destructive migration,** confirm an Atlas backup or snapshot exists, and get explicit approval.

## History

| Id                                              | What                                                                                                                                                                                                                           | Destructive?                                                                                                                                                                                                                |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `001-users-phone-partial-unique`                | Recreates `users.phone_1` as a **partial** unique index (only where `phone` is a string), so users without a phone (Google sign-in) are allowed. Backfills `phoneVerifiedAt` for existing phone users from `createdAt`         | Drops and recreates one index; no data is removed. Phone uniqueness is kept. If a duplicate phone were inserted in the instant between drop and create, the create would fail loudly, and rerunning after fixing it is safe |
| `002-threads-split-replies-likes`               | Copies embedded `threads.replies` into `thread_replies` (keeping each reply's original `_id`) and `threads.likedBy` into `thread_likes`, and sets `replyCount` on every thread. Creates the two new collections' indexes first | No. **Expand only:** the legacy arrays are left in place and never read                                                                                                                                                     |
| `003-products-media-urls`                       | Rewrites `/api/img/<id>` photo URLs on listings to the API's `/api/v1/media/<id>`. For local development, also copy the files: `cp frontend/.data/uploads/* backend/.data/uploads/`                                            | No. Only the URL prefix changes                                                                                                                                                                                             |
| `004-contract-legacy-thread-arrays-and-indexes` | Verifies every embedded reply and like was copied, then removes `threads.replies` and `threads.likedBy`, and drops the unused indexes `products.city_1`, `products.sellerSlug_1`, `threads.at_1` and `threads.authorId_1`      | **Yes.** Not reversible by the script; the data lives on in the new collections, and restoring the old arrays needs a backup                                                                                                |

**Schema notes without a migration:** milestone 5 added the `swap_requests` collection (its indexes are created at startup) and a `"removed"` value for `products.status`. Both are backward-compatible: old documents are unaffected, and no data had to change.

**004 is written and tested but not yet run on Atlas** (it deletes data, so it needs explicit approval and a backup first). It refuses to run if any reply or like is missing from the new collections.
