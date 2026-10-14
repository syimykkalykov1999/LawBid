# Backups and restore (docs/06 §6.4)

| What | How | Retention | Where to check |
|---|---|---|---|
| PostgreSQL 16 (managed — e.g. AWS RDS / Neon / Supabase; the owner picks one) | provider's automated daily snapshots + point-in-time recovery (WAL); optional extra `pg_dump -Fc` before risky operations | 30 days (daily) | provider console → Backups / Snapshots |
| S3 documents | versioning + cross-region replication (`*-documents-replica`) | old versions 90 days | S3 console, replication metrics |
| S3 media | versioning | old versions 30 days | S3 console |
| Redis | none (not a source of truth; rebuilt from DB/queues re-enqueue) | — | — |
| Terraform state | S3 versioned bucket + DynamoDB lock | — | state bucket |

Targets: **RPO ≤ 1 hour** (continuous WAL archiving / PITR), **RTO ≤ 4 hours**.

## Restore procedure (database)

1. Announce; put the app in maintenance (scale `api` desired count to 0 or
   answer 503 at the WAF).
2. Provider console → Backups / point-in-time restore → restore to a **new**
   database instance (PITR to the minute before the incident). Never restore
   over the live database. Without a managed PITR: `pg_restore --no-owner
   -d "$NEW_URL" backup.dump` from the newest `pg_dump -Fc` file.
3. Point the `DATABASE_URL` / `MIGRATOR_DATABASE_URL` /
   `RETENTION_DATABASE_URL` secrets at the new instance (through the
   connection pooler — PgBouncer / RDS Proxy — if one is used); run
   `infra/postgres/role-settings.sql` if the roles' settings were not
   restored, then `scripts/deploy/run-migrations.sh <env>` (no-op if in sync).
4. Force a new deployment of `api`, `worker`, `admin`; smoke
   (`scripts/deploy/smoke.sh`).
5. Run `journal.chain-verify` manually (`JobsRunner.runNow`) — a restore
   must not cut a chain; if it does, see
   [journal-integrity.md](journal-integrity.md).
6. Re-drive missed Stripe webhooks (Stripe Dashboard → Resend since the
   restore point).

## Before every prod migration

`check-backup.sh` in the Deploy workflow refuses to run migrations when
the latest backup is older than 26 hours (until the production provider
is picked it only warns — see PROD_LAUNCH.md «Owner decision»).

## Quarterly drill

`pg_restore` (or the provider's restore) into a scratch database, then
`scripts/ops/restore-drill.sh`; anything restored into the staging account
from a prod backup copy is **anonymized** first (docs/06 §6.2: prod data never reaches staging raw); record in
[restore-drill.md](restore-drill.md).
