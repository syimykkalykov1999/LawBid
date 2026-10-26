# Backup failed

> **С 2026-10-22 (AWS Backup):** письма `lawbid-prod-db-backup-age` и
> «резервная копия базы не сделана» приходят от плана AWS Backup
> (`infra/modules/backup`). AWS Console → AWS Backup → Jobs → строка с
> FAILED → Status message. Частая причина — копия попала в окно бэкапа или
> обслуживания RDS: следующая ночь проходит сама. Два дня подряд — Claude
> «бэкап». Подробно: [backups.md](backups.md).

> **Для владельца:** Бэкапы делает провайдер базы PostgreSQL (управляемая база, например AWS RDS / Neon / Supabase). Откройте его консоль → Backups / Snapshots; ошибка — их поддержка или Claude «бэкап». Все письма и кнопки: [OWNER.md](OWNER.md).

The managed PostgreSQL 16 provider (e.g. AWS RDS / Neon / Supabase — the
owner picks one) runs the automated backups (daily snapshots + WAL-based
point-in-time recovery — docs/06 §6.4) and alerts by email on failure
(subscribe the ops address in its console / event notifications). S3 documents are
versioned and replicated cross-region (replication metrics in the S3
console).

**Act.** Open a support ticket with the database provider if a backup
failed twice in a row; meanwhile take a manual `pg_dump -Fc` with the
read-only role into the documents account's backup bucket, and until it is
fixed block prod migrations (the Deploy workflow's `check-backup.sh`
refuses when the latest backup is older than 26 hours). Verify the S3 replication status for the documents bucket.
