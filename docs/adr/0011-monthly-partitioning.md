---
status: "proposed"
date: 2026-10-24
decision-makers: owner + Claude
---

# Monthly partitioning of the biggest append-only tables

## Context and problem statement

Tables such as messages, notifications, audit log and view events only grow.
Deleting old rows from one huge table is slow and bloats indexes; the sharding plan
says partitioning these first buys the most headroom.

## Decision drivers

- Cheap retention: drop a month instead of deleting millions of rows.
- Keep indexes and vacuum small.
- No behaviour change for the app.

## Considered options

- Monthly range partitions managed by `pg_partman` once a table passes about 50M rows (proposed)
- Never partition, rely on shards
- Move history to cold storage only

## Decision outcome

Proposed, not built: no migration in the repo uses `PARTITION BY` today.
Trigger: any table above about 50M rows. Order: audit log, notifications, messages.
Partition key is time; with sharding the table is partitioned inside each shard.

### Consequences

- Good: retention jobs become `DROP`/detach of old partitions.
- Bad: primary keys and unique indexes must include the partition column; the migration safety check and Prisma need care; needs the `pg_partman` extension on RDS.
- Confirmation: a table-size alarm or admin Storage page showing a table above the threshold.

## More information

[BENCHMARK_BIG_APPS.md](../architecture/BENCHMARK_BIG_APPS.md) (partitioning row, 6 agent-hours), [SHARDING_READY.md](../architecture/SHARDING_READY.md) section 9. Back-filled 2026-10-25.
