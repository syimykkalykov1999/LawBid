# Migrations: expand / contract only (2026-10-24)

## Rule

Every migration must be safe to run while the **previous release** is still serving traffic, and safe to roll back one release (`.github/workflows/rollback.yml`). So a schema change is never one step:

1. **Expand** (release N): add the new shape only. New nullable column, new column with a DEFAULT, new table, new index (`CONCURRENTLY` on big tables). Old code keeps working.
2. **Migrate** (release N, code): write to old and new, backfill old rows in batches, read from the new one.
3. **Contract** (release N+1 or later, only after N is fully rolled out and rollback to N-1 is no longer wanted): drop the old column/table, rename finished, tighten NOT NULL.

## What the CI check refuses

`apps/api/scripts/check-migrations.mjs` (CI step "Migrations are expand/contract only") scans every migration newer than the baseline and fails on:

- `DROP TABLE`, `DROP COLUMN`
- `RENAME` of a table or column
- `ALTER COLUMN ... TYPE` (widening `VARCHAR(n)` without `USING` is allowed)
- `ADD COLUMN ... NOT NULL` without `DEFAULT` (or a generated `AS` expression)

Comments are ignored, so a word in a comment cannot trip it.

## The contract marker

A real contract step carries one line anywhere in the same migration.sql:

```sql
-- migration-safety: contract <why it is safe: which release stopped reading it, PR number>
```

The check then passes and prints the reason in the CI log, so the reviewer sees it. A marker without a reason is accepted but prints "no reason given" - reviewers should reject that. One marker covers the whole file, so keep contract migrations single-purpose.

Checked by `node --test apps/api/scripts/check-migrations.test.mjs` (14 cases: each forbidden statement is rejected, passes with the marker, additive changes and comments pass). The test also runs in CI.

## How others do it (sources)

- GitLab, [Avoiding downtime in migrations](https://docs.gitlab.com/development/database/avoiding_downtime_in_migrations) (current docs): a rename is a regular migration that adds and syncs the new column, then a **post-deployment migration** that cleans up the old one in a later release; the model ignores the old column in between. Their [Migration Style Guide](https://docs.gitlab.co.jp/ee/development/migration_style_guide.html) states migrations must never require taking the installation offline.
- Stripe, [Online migrations at scale](https://stripe.com/blog/online-migrations) (Jacqueline Xu, 2017, still the reference): four steps - dual-write, change reads, change writes, remove the old path - with lazy copy plus a bulk backfill job and a final verification run that confirms nothing is missing. See also InfoQ, [Stripe zero-downtime data movement](https://infoq.com/news/2025/11/stripe-zero-downtime-date-move/) (Nov 2025), for the same idea applied to shard moves.
- Pattern write-ups (2025-2026): [Zero-Downtime Database Migration Architecture (2026), AppScale](https://appscale.blog/en/blog/zero-downtime-database-migration-architecture-expand-contract-backfill-2026); [Zero-Downtime Database Migrations: The Expand-Contract Pattern, DEV](https://dev.to/mubashirtaj/zero-downtime-database-migrations-the-expand-contract-pattern-236k); [Expand and Contract - Tim Wellhausen](https://www.tim-wellhausen.de/papers/ExpandAndContract/ExpandAndContract.html) (the original "parallel change" description).
- Postgres specifics from these write-ups: adding a nullable column (or one with a constant DEFAULT) is metadata-only; `CREATE INDEX CONCURRENTLY` does not block writes; use `ADD CONSTRAINT ... NOT VALID` then `VALIDATE CONSTRAINT` to avoid long locks.
- Not verified from primary sources: Shopify's practice (I found only secondary claims, so nothing is attributed to them here).

## Recipes

| Want | Do |
|---|---|
| Rename column | add new + write both (N), backfill, read new (N), drop old with marker (N+1) |
| Change type | add new typed column, same as rename |
| Add NOT NULL | add with `DEFAULT`, or add nullable, backfill, then `SET NOT NULL` via validated CHECK in N+1 |
| Drop column | stop reading and writing it in N, drop with marker in N+1 |
| Drop table | same, after 1 full release with no queries (check `pg_stat_user_tables`) |
