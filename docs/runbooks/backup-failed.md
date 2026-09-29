# Backup failed

CockroachDB Cloud runs the managed backups (daily full, hourly
incremental, PITR — docs/06 §6.4) and alerts by email on failure (Cloud
Console → Alerts, subscribed with the ops address). S3 documents are
versioned and replicated cross-region (replication metrics in the S3
console).

**Act.** Open a support ticket with Cockroach Labs if a backup failed
twice in a row; until it is fixed, block prod migrations (the Deploy
workflow's `check-backup.sh` refuses when the latest full backup is older
than 26 hours). Verify the S3 replication status for the documents bucket.
