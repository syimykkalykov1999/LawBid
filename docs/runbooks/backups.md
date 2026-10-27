# Backups and restore (docs/06 §6.4)

> **Для владельца:** база делает копии сама (RDS, каждую ночь, 14+ дней,
> восстановление на любую секунду). С 2026-10-22 к этому добавлен AWS
> Backup: каждая ночная копия уходит ещё и в другой регион (us-west-2), по
> желанию — в отдельный «резервный» аккаунт AWS. Раз в квартал запускаем
> учебное восстановление одной командой (`scripts/ops/restore-drill.sh`).
> Что один раз включить руками в консоли — раздел «Консоль RDS» ниже.

| What | How | Retention | Where to check |
|---|---|---|---|
| PostgreSQL 16 — RDS `lawbid-prod-postgres` (created outside Terraform) | RDS automated backups: daily snapshot + transaction log → point-in-time restore to any second | 14 days (min, `database_backup_retention_days`) | RDS console → instance → Maintenance & backups |
| PostgreSQL — isolated copies | AWS Backup plan `lawbid-prod-db-daily` (modules/backup): 06:00 UTC daily, copy to vault `lawbid-prod-db-dr` in **us-west-2**; optional copy to a separate backup account | 35 days (`backup_retention_days`) | AWS Backup console → Jobs / Backup vaults |
| S3 documents | versioning + cross-region replication (`*-documents-replica`) | old versions 90 days | S3 console, replication metrics |
| S3 media | versioning | old versions 30 days | S3 console |
| Redis | none (not a source of truth; rebuilt from DB/queues re-enqueue) | — | — |
| Terraform state | S3 versioned bucket + DynamoDB lock | — | state bucket |

Targets: **RPO ≤ 1 hour** (point-in-time restore: in practice ≤ 5 min),
**RTO ≤ 4 hours**. Region loss: RPO ≤ 24 h (newest copy in us-west-2).

Why (AWS Well-Architected, Reliability pillar):
[REL09 — back up data](https://docs.aws.amazon.com/wellarchitected/latest/reliability-pillar/back-up-data.html)
(automated, isolated copies, periodic restore tests —
[REL09-BP04](https://docs.aws.amazon.com/wellarchitected/latest/reliability-pillar/rel_backing_up_data_periodic_recovery_testing_data.html)),
[REL13 — plan for disaster recovery](https://docs.aws.amazon.com/wellarchitected/latest/reliability-pillar/plan-for-disaster-recovery-dr.html).
Copies: [AWS Backup cross-Region](https://docs.aws.amazon.com/aws-backup/latest/devguide/cross-region-backup.html),
[cross-account](https://docs.aws.amazon.com/aws-backup/latest/devguide/create-cross-account-backup.html).
Multi-AZ: [RDS Multi-AZ](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Concepts.MultiAZSingleStandby.html).

## Консоль RDS: что владелец включает руками (база вне Terraform)

`create_database = false`: Terraform прод-базу **не создаёт и не меняет**.
Он только (1) делает её копии через AWS Backup и (2) при `terraform plan`
проверяет настройки и пишет предупреждение (`Warning: Check block assertion
failed`), если что-то выключено. Для этого в `terraform.tfvars` должна быть
строка `existing_database_identifier = "lawbid-prod-postgres"`.

Один раз, в окно тишины (Multi-AZ включается без остановки, но 10–30 минут
база работает чуть медленнее):

1. AWS Console → RDS → Databases → `lawbid-prod-postgres` → **Modify**.
2. **Availability & durability → Multi-AZ DB instance** (Create a standby
   instance). Цена инстанса ×2.
3. **Additional configuration → Backup**:
   - Backup retention period: **14 days** (или больше, до 35);
   - Backup window: **Select window → 03:10 UTC, 0.5 hours** (не
     пересекается с AWS Backup в 06:00 и обслуживанием в вс 04:30);
   - Copy tags to snapshots: да.
4. **Deletion protection: Enable deletion protection** — да.
5. Maintenance window: **Sun 04:30 UTC, 1 hour** (если пусто).
6. Continue → **Apply immediately** → Modify DB instance.
7. Проверка в терминале (ждём `True 14 True` и время не старше 5 минут):

   ```sh
   aws rds describe-db-instances --db-instance-identifier lawbid-prod-postgres \
     --query 'DBInstances[0].[MultiAZ,BackupRetentionPeriod,DeletionProtection,LatestRestorableTime,KmsKeyId]' --output text
   ```

   `LatestRestorableTime` в пределах ~5 минут от сейчас = восстановление на
   секунду (PITR) работает. `KmsKeyId`: если это `alias/aws/rds` (ключ AWS
   по умолчанию), копия в **другой аккаунт** невозможна (ключ AWS нельзя
   открыть другому аккаунту); копия в другой регион работает. Для другого
   аккаунта нужна база на своём ключе — сказать Claude «перешифровать базу».

## Тревоги о бэкапах

- `lawbid-prod-db-backup-age` (CloudWatch): за сутки нет ни одной готовой
  копии AWS Backup. Пустые данные = тревога (план мог остановиться молча).
  Чтобы не было ложной тревоги до первой копии, на это время в tfvars
  `backup_age_missing_data = "notBreaching"`, после первой готовой копии
  вернуть `"breaching"` (docs/runbooks/restore-drill.md, пакет A).
- EventBridge `lawbid-prod-backup-failed`: копия или перенос в us-west-2 /
  резервный аккаунт не удались — письмо через несколько минут.
- Проверить, что AWS Backup публикует метрику с нужными измерениями:
  `aws cloudwatch list-metrics --namespace AWS/Backup --metric-name NumberOfBackupJobsCompleted`
  (ждём `ResourceType=RDS` + `BackupVaultName=lawbid-prod-db`). Если
  набор измерений другой — сказать Claude, тревогу поправим.

## Отдельный резервный аккаунт (по желанию, по умолчанию выключено)

Защищает от взлома или закрытия основного аккаунта. Нужна AWS Organizations.

1. Organizations (управляющий аккаунт) → создать аккаунт `lawbid-backup`.
2. AWS Backup → Settings → **Cross-account management → Cross-account backup: Turn on**
   (в управляющем аккаунте организации).
3. В аккаунте `lawbid-backup`, регион us-east-1: AWS Backup → Backup vaults →
   Create → имя `lawbid-backup-copy`, ключ — свой KMS-ключ этого аккаунта →
   Access policy: разрешить `backup:CopyIntoBackupVault` для основного
   аккаунта `047754151252`.
4. В `terraform.tfvars` прода: `backup_copy_account_id = "<12 цифр>"` →
   `plan` / `apply`. Terraform добавит перенос в план и откроет ключ базы
   этому аккаунту (только если база на нашем ключе KMS, см. выше).

## Restore procedure (database)

1. Announce; put the app in maintenance (scale `api` desired count to 0 or
   answer 503 at the WAF).
2. RDS console → `lawbid-prod-postgres` → Actions → **Restore to point in
   time** (the minute before the incident) → into a **new** instance. Region
   lost: AWS Backup → Backup vaults → `lawbid-prod-db-dr` (us-west-2) →
   newest recovery point → Restore. Never restore over the live database.
3. Point the `DATABASE_URL` / `MIGRATOR_DATABASE_URL` /
   `RETENTION_DATABASE_URL` secrets at the new instance; run
   `infra/postgres/role-settings.sql` if the roles' settings were not
   restored, then `scripts/deploy/run-migrations.sh <env>` (no-op if in sync).
4. Force a new deployment of `api`, `worker`, `admin`; smoke
   (`scripts/deploy/smoke.sh`).
5. Run `journal.chain-verify` manually (`JobsRunner.runNow`) — a restore
   must not cut a chain; if it does, see
   [journal-integrity.md](journal-integrity.md).
6. Re-drive missed Stripe webhooks (Stripe Dashboard → Resend since the
   restore point).
7. **Re-run the erasures (privacy, mandatory).** The restore brings back
   people who were deleted after the restore point (their names, messages,
   phone). The erasure ledger lives outside the restorable data too: one
   object per person, `erasure-ledger/<user id>.json`, in the private
   `documents` bucket. Before the app serves traffic again (or at once, with
   the app in maintenance): `DRY_RUN=1 npm run privacy:reapply-erasures`
   (counts only), then `npm run privacy:reapply-erasures` (anonymizes every
   ledger id that is not anonymized; a legal hold defers one). Never skip it:
   processing restored data of an erased person is what regulators object to.
   Owner step: turn on S3 Object Lock (governance) for the `erasure-ledger/`
   prefix or a dedicated bucket so the ledger itself cannot be altered.

## Before every prod migration

`check-backup.sh` in the Deploy workflow refuses to run migrations when
the latest backup is older than 26 hours (until `DB_BACKUP_LATEST_ISO` is
fed from `LatestRestorableTime` it only warns — see PROD_LAUNCH.md).

## Quarterly drill

`scripts/ops/restore-drill.sh` — one command, restores the newest snapshot
into a temporary instance, runs a smoke query from inside the VPC, deletes
the instance and prints the row for [restore-drill.md](restore-drill.md).
Anything restored into the staging account from a prod backup copy is
**anonymized** first (docs/06 §6.2: prod data never reaches staging raw).
