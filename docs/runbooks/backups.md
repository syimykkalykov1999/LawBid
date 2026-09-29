# Backups and restore (docs/06 §6.4)

| What | How | Retention | Where to check |
|---|---|---|---|
| CockroachDB | managed: full daily, incremental hourly, PITR | 30 days (daily) | Cloud Console → Backups |
| S3 documents | versioning + cross-region replication (`*-documents-replica`) | old versions 90 days | S3 console, replication metrics |
| S3 media | versioning | old versions 30 days | S3 console |
| Redis | none (not a source of truth; rebuilt from DB/queues re-enqueue) | — | — |
| Terraform state | S3 versioned bucket + DynamoDB lock | — | state bucket |

Targets: **RPO ≤ 1 hour** (hourly incrementals + PITR), **RTO ≤ 4 hours**.

## Restore procedure (database)

1. Announce; put the app in maintenance (scale `api` desired count to 0 or
   answer 503 at the WAF).
2. Cloud Console → Backups → restore to a **new** cluster (PITR to the
   minute before the incident). Never restore over the live cluster.
3. Point the `DATABASE_URL` / `MIGRATOR_DATABASE_URL` /
   `RETENTION_DATABASE_URL` secrets at the new cluster; run
   `scripts/deploy/run-migrations.sh <cluster>` (no-op if in sync).
4. Force a new deployment of `api`, `worker`, `admin`; smoke
   (`scripts/deploy/smoke.sh`).
5. Run `journal.chain-verify` manually (`JobsRunner.runNow`) — a restore
   must not cut a chain; if it does, see
   [journal-integrity.md](journal-integrity.md).
6. Re-drive missed Stripe webhooks (Stripe Dashboard → Resend since the
   restore point).

## Before every prod migration

`check-backup.sh` in the Deploy workflow refuses to run migrations when
the latest full backup is older than 26 hours.

## Quarterly drill

Restore into the staging account from a prod backup copy **anonymized**
first (docs/06 §6.2: prod data never reaches staging raw); record in
[restore-drill.md](restore-drill.md).
