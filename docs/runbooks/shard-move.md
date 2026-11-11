# Runbook: split the database (move logical shards to a second server)

Design: `docs/architecture/SHARDING_READY.md` section 13. Read-only commands are safe at any time.

## When
Primary CPU above 60 % for days after replicas and the pooler, a table above 500 GB, or write IOPS near the instance limit. Not before.

## Automatic (default, owner 2026-11-11)
`db.shards_mode` = Авто (Admin → Настройки): the cloud automation turns «Второй сервер базы» on by itself when «Здоровье системы» shows the split threshold at 80 % (`growth.shard_gb` / `growth.shard_rows`) or the database CPU stays high with the read copy and the pooler already on. Once the threshold is reached and the server is migrated, the FIRST split (upper half of the shards, the card's plan) starts by itself inside `db.shards_move_hours` (02:00-05:00 Chicago). Later moves and «Откатить» stay buttons. Вкл = keep a server, Выкл = only by hand. Never removed by itself.

## Turn on the second server (one switch, owner 2026-11-11)
Admin: Система, Облако, «Второй сервер базы» → Вкл (one 2FA code). Terraform (`db_shards = 1`) creates an EMPTY PostgreSQL 16 server like the primary (same class, Multi-AZ, encryption, network; deletion protection on) and gives the tasks only its host (`DB_SHARD_HOSTS`). The next deploy's migrate task runs `prisma/migrate-shards.mjs`: all migrations, the runtime roles with the primary's passwords, the role timeouts. Nothing is filled by hand. Until a shard is moved nothing uses it.
- Re-check: `readiness db1` below says "migrations differ" until that deploy ran.
- Off: refused while any shard lives there (deletion protection + the plan guard); move the shards back first.
- Legacy random-id rows (seed/demo data): `plan` reports them.

## Check (changes nothing)
```
npm run shard:move --workspace apps/api -- readiness db1
npm run shard:move --workspace apps/api -- split-plan db1     # which shards, rows, time
npm run shard:move --workspace apps/api -- plan 200 db1       # dry run of one shard
```

## Do it
Admin: Система, Здоровье системы, «Разделить базу», «Показать план», «Разделить базу» (one fresh 2FA code; no second admin). Or the CLI: `split db1` / `move 200 db1`.
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
