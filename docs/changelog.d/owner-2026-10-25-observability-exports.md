## Owner 2026-10-25 — Heavy users card, monthly restore test, streamed exports (WP-G)

- Admin → Система → Масштаб: **«Тяжёлые пользователи»**, top 20 users and cases by
  requests, database time, uploads and messages over the last hour
  (`GET admin/system-health/heavy-hitters`; Redis sorted-set buckets under the `{hh}` hash tag,
  requests sampled 1 in 10, no per-user CloudWatch metrics).
- **Monthly restore test** by AWS Backup restore testing (Terraform in `modules/backup`); a failure
  rings the critical topic; the last result is the health item `restore_drill` («Учебное
  восстановление базы»).
- **Streamed exports**: user data export, legal archive and admin CSV no longer hold whole files in
  memory (keyset pages, archiver, S3 multipart via `@aws-sdk/lib-storage`), with size/time limits,
  progress (`progress` on `GET users/me/data-export/:id`) and safe restart. See
  `docs/architecture/OBSERVABILITY_AND_EXPORTS.md`.
