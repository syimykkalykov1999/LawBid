# Runbook: split the database (move logical shards to a second server)

Design: `docs/architecture/SHARDING_READY.md` section 13. Read-only commands are safe at any time.

## When
Primary CPU above 60 % for days after replicas and the pooler, a table above 500 GB, or write IOPS near the instance limit. Not before.

## Owner checklist (once, before the first real split)
1. Create the second RDS PostgreSQL 16 instance (same class as the primary, Multi-AZ if the primary is) with the same role setup as `infra/postgres/role-settings.sql`. Logical replication is NOT needed (and `rds.logical_replication` would need a reboot).
2. Put its URL into the secret that feeds `DATABASE_URL_SHARDS`, as JSON: `{"db1":"postgresql://user:pass@host:5432/lawbid"}`. Redeploy API and worker (they read it at start). Until a shard is moved nothing uses it.
3. Apply migrations to it: `DATABASE_URL=<db1 url> npx prisma migrate deploy` (apps/api). Repeat after every release that adds a migration, BEFORE deploying that release.
4. Give db1 the same database role settings (statement timeouts, journal retention role) as the primary.
5. Make sure there are no legacy random-id rows (seed/demo data): `plan` reports them.

## Check (changes nothing)
```
npm run shard:move --workspace apps/api -- readiness db1
npm run shard:move --workspace apps/api -- split-plan db1     # which shards, rows, time
npm run shard:move --workspace apps/api -- plan 200 db1       # dry run of one shard
```

## Do it
Admin: Система, Здоровье системы, «Разделить базу», «Показать план», «Разделить базу» (fresh 2FA, then a second admin approves in «Согласования»). Or the CLI: `split db1` / `move 200 db1`.
During a move, writes of that one part pause for seconds; the page shows progress per part. A stopped move shows «Продолжить» (resumes from the saved step).

## Roll back
Button «Откатить» or `rollback <moveId>`. Before the flip it removes the copy; after the flip it first replays the new writes back to the old server. Possible until the old rows are deleted (7 days after the flip).

## Afterwards
- Old rows are deleted automatically 7 days later (`cleanup <moveId> --force` earlier; it refuses to empty the database that serves the shard).
- Watch the logs for `cross_family_orphans` (nightly), `shard_no_context`, and `55P03` errors (writes refused during a freeze; seconds).
- The foreign keys between families are dropped on both databases by the move (`fk-drop` / `fk-restore` do it by hand).
- Backups are per instance; there is no cross-database consistent restore point. After restoring one database run `orphans`.

## Failure cheat-sheet
- Move `failed` in verify: counts differ; nothing was flipped; `resume` catches up again, or `rollback`.
- Lease stuck: the key `lawbid:shard-move:lease` expires 60 s after the runner dies.
- Writes refused with "frozen for a move" for more than a minute: the mover died after the fence; run `resume <id>` or `rollback <id>`.
- `shard_map` names a key missing from `DATABASE_URL_SHARDS`: the API throws `ShardDatabaseNotConfiguredError`; fix the secret first.
