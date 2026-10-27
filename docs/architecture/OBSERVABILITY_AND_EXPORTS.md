# Heavy users, monthly restore test, streamed exports (WP-G, 2026-10-25)

> **Для владельца (5 строк):**
> 1. В админке «Система → Масштаб» появилась карточка «Тяжёлые пользователи»: топ-20 людей и кейсов по запросам, нагрузке на базу, загрузкам и сообщениям за последний час. Стоит $0 (счётчик в Redis, выборочный).
> 2. Раз в месяц AWS сам поднимает временную базу из свежей копии, замеряет время и удаляет её; если не вышло, звонит на телефон (критический канал). Результат виден в «Здоровье системы → Учебное восстановление базы».
> 3. Выгрузки данных (мои данные, архив для госорганов, CSV в админке) больше не грузятся в память целиком: идут потоком кусками, с лимитом 2 ГБ / 20 минут; упавшая выгрузка сама повторяется.
> 4. Чтобы включить месячную проверку, нужен один `terraform apply` (вы применяете); остальное включается обычным выкатом.
> 5. Ничего нажимать не нужно: всё автоматическое, всё работает по умолчанию, вид приложения не менялся.

Research first (all checked 2026-10-25; ready-made pieces preferred over our own code):

| Question | Finding | Used |
|---|---|---|
| Redis TopK on ElastiCache? | RedisBloom `TopK` is not offered. AWS added **Bloom filters** to ElastiCache for Valkey 8.1 (*Amazon ElastiCache now supports Valkey 8.1*, AWS What's New, 2025-07-24, https://aws.amazon.com/about-aws/whats-new/2025/07/amazon-elasticache-valkey-8-1/), no TopK. | Standard Redis pattern: sorted set per 5-minute bucket, `ZUNIONSTORE` over the window, capped with `ZREMRANGEBYRANK`, keys expire by themselves. |
| Monthly restore drill | **AWS Backup restore testing** (*Restore testing*, AWS Backup Developer Guide, https://docs.aws.amazon.com/aws-backup/latest/devguide/restore-testing.html): scheduled plan + selection, supports RDS, infers restore metadata, deletes the restored resource after the validation window, records status and duration, emits EventBridge `Restore Job State Change` events (https://docs.aws.amazon.com/aws-backup/latest/devguide/restore-testing-validation.html). | `aws_backup_restore_testing_plan` + `_selection` in Terraform; EventBridge rule to the critical SNS topic on FAILED/ABORTED/EXPIRED. No Step Function, no ECS task, no GitHub workflow. |
| Multipart streaming to S3 | `@aws-sdk/lib-storage` `Upload` (AWS's helper: parts, queue, abort on error). | `S3StorageService.putStream`. |
| ZIP | `archiver` (already used). | Streams entries one by one. |

Why not a GitHub Actions or Step Function: the managed feature is the only option that
needs no code, no credentials in GitHub, no image with the AWS CLI, and no ownership of
cleanup (AWS deletes the copy itself). The shell drill (`scripts/ops/restore-drill.sh`) stays for the
real row-count smoke query (quarterly, by hand).

## 1. Heavy users and cases

- Code: `apps/api/src/common/heavy-hitters/*`, report `admin-ops/heavy-hitters-report.service.ts`,
  endpoint `GET /admin/system-health/heavy-hitters` (super_admin), admin card
  `apps/admin/.../scale/heavy-users-card.tsx`.
- Metrics: `requests`, `db_ms` (sampled 1 in `HEAVY_HITTERS_SAMPLE`, default 0 = OFF, recommended 10, weight
  scaled back), `upload_bytes` (on file confirm) and `messages` (on chat send), exact. By user and by case.
- Window `HEAVY_HITTERS_WINDOW_MIN` (default 60). `HEAVY_HITTERS_SAMPLE=0` switches it off.
- Redis keys: `{hh}:<metric>:<user|case>:<bucket>`. The hash tag `{hh}` keeps the multi-key
  Lua scripts in one slot (works with `redis_cluster_mode` later, see REDIS_AUTOSCALE.md).
  Writes are summed in the process and sent every 5 s as one Lua call per metric and subject
  (about 8 commands per 5 s per container). Memory: a few MB (500 members per bucket, 2 h TTL).
- No CloudWatch dimension per user (a custom metric per user would cost $0.30/month each).
- Fail-soft: Redis down means counts are dropped; requests are never slowed or failed.

## 2. Monthly restore test

- Terraform: `infra/modules/backup` (`aws_backup_restore_testing_plan` on the 1st at 14:00 UTC,
  newest recovery point of the last 7 days, `db.t4g.micro`, single-AZ, private, same subnet group and
  security groups as production, validation window 1 h) and the EventBridge rule
  `<name>-restore-test-failed` to the critical topic. Switch: `backup_restore_test_enabled`
  (default true). Cost: restore-test fee + a micro database for about an hour, cents per month.
- API: `RestoreDrillService` reads the result with `backup:ListRestoreJobs` (added to the ECS task
  role) and `GET /admin/system-health` shows item `restore_drill`: green (last restore completed,
  younger than 40 days), yellow (overdue), red (last one failed), grey (not on AWS or not run yet).
  A manual drill by the script also counts: it is a restore job too.
- Not covered by the managed test: a row-count check. The quarterly manual run
  (`MODE=backup-vault scripts/ops/restore-drill.sh`) keeps that.

## 3. Streaming exports

| Export | Before | Now |
|---|---|---|
| User data export (`DataExportService`) | all rows + ZIP in memory | rows read 1000 at a time (keyset), JSON streamed into the ZIP, S3 multipart (`putStream`); 2 GiB / 20 min limits; progress (rows, bytes) in Redis and in `GET /users/me/data-export/:id` (`progress`); a failed attempt aborts the upload and re-queues, so the BullMQ retry rebuilds the same key. A dead worker's `processing` row is taken over after 25 min. |
| Legal evidence archive (`LegalExportBuilder`) | every file as a Buffer, then the ZIP as a Buffer | data files streamed and hashed on the way into the ZIP and S3 multipart; `SHA256SUMS.txt` and `manifest.json` last; 1 GiB limit; rows were already capped by `legal.export_max_rows`. The readable `report.pdf` is still built in memory (bounded by the same caps). |
| Case history PDF | PDF Buffer | unchanged shape (pdfkit lays out synchronously); bounded by 1000 cases and a new 64 MiB ceiling that fails the job cleanly. |
| Admin CSV (`/admin/exports`) | up to 50 000 rows built into one string | streamed to the response 1000 rows at a time; the audit row is written when the response ends with the real byte count. |
| Partners / outreach / own payments CSV | in memory, capped at 50 000 / 50 000 / 5 000 rows | unchanged (capped); candidate for the same treatment if they grow. |

"Resumable": not mid-stream (a ZIP cannot be resumed byte-exact). Restartable and idempotent: same
S3 key, no orphan parts (`leavePartsOnError: false`, plus the existing bucket rule that aborts incomplete
multipart uploads after 7 days).

Tests: `common/streaming/export-stream.spec.ts` streams 50 000 messages (about 200 MB of JSON) plus 500 file
rows into a fake S3 and asserts peak memory growth under 120 MB and that a failure aborts the upload;
`privacy/data-export.service.spec.ts` does the same through the real service with paged mocks.

## Owner steps

1. Merge the PR; the normal deploy ships the API, worker and admin.
2. `terraform apply` for prod once (adds the restore-test plan, its alert rule and the
   `backup:ListRestoreJobs` permission). Until then the board item stays grey.
3. After the first run (1st of the month) check «Здоровье системы → Учебное восстановление базы».
