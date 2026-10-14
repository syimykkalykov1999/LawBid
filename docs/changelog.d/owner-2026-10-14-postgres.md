## PostgreSQL instead of CockroachDB (owner 2026-10-14)

The whole project runs on PostgreSQL 16: dev (`docker compose up`), CI,
tests and the demo world.

- `schema.prisma`: provider `postgresql`; text columns are `VARCHAR(n)` /
  `TEXT`; the computed columns (name, phone hash, search vectors) are
  `GENERATED ALWAYS ... STORED`.
- The 155 CockroachDB migrations are replaced by one PostgreSQL baseline
  (`20261014100000_postgres_baseline`): the same schema (every CHECK,
  partial and trigram index), the database roles, and the reference rows.
  `prisma migrate diff` against it reports no drift.
- Transactions run SERIALIZABLE (what the code was written against;
  PostgreSQL's default is READ COMMITTED); 40001 is still retried.
- Raw SQL rewritten for PostgreSQL: batched deletes use `ctid`, no
  `max(uuid)`, table sizes from `pg_class`, demo database created after a
  `pg_database` check.
- CI: PostgreSQL service container; e2e global setup uses `pg_database`;
  the EXPLAIN tests read PostgreSQL plans; the upgrade-from-previous
  script skips a previous set written for another engine.
- Still on CockroachDB Cloud wording until a production PostgreSQL service
  is picked: backup-freshness check, `scripts/deploy/prod-db-setup.sh`,
  runbooks.
