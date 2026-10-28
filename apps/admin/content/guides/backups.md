---
id: backups
title: Копии базы: как они делаются, что включить руками и что делать, если копия не удалась
category: system
cost: Хранение копий около $0.095 за ГБ в месяц в каждом месте хранения (оценка: 100 ГБ базы ≈ $10-20 в месяц за все копии)
time: Один раз 20 минут в консоли RDS; при письме о сбое 5-10 минут
runbook: backups.md, backup-failed.md
verified: 2026-10-27
sources:
  - Репозиторий: docs/runbooks/backups.md | https://github.com/syimykkalykov1999/LawBid/blob/main/docs/runbooks/backups.md
  - Репозиторий: docs/runbooks/backup-failed.md | https://github.com/syimykkalykov1999/LawBid/blob/main/docs/runbooks/backup-failed.md
  - AWS RDS: Working with backups | https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_WorkingWithAutomatedBackups.html
  - AWS Backup: Cross-Region backup | https://docs.aws.amazon.com/aws-backup/latest/devguide/cross-region-backup.html
  - AWS Well-Architected: Back up data (REL09) | https://docs.aws.amazon.com/wellarchitected/latest/reliability-pillar/back-up-data.html
---

## Что это и зачем

База данных это все кейсы, чаты, профили и платежи. Копии (бэкапы) делаются сами, в трёх слоях:

- RDS (хостинг базы) каждую ночь делает снимок и непрерывно пишет журнал изменений, поэтому базу можно вернуть на любую секунду за последние 14 дней.
- AWS Backup каждую ночь в 06:00 UTC делает отдельную копию и увозит её в другой регион (us-west-2), хранит 35 дней. Если целый регион AWS выйдет из строя, копия есть в другом.
- Документы в хранилище S3 хранят старые версии 90 дней и копируются в другой регион; медиа хранит версии 30 дней.

Цели: потерять не больше часа данных (на практике минуты), восстановиться не дольше чем за 4 часа. Копия, которую ни разу не восстанавливали, не считается рабочей: раз в 90 дней делается учебное восстановление (инструкция «Учебное восстановление базы (раз в 90 дней)»).

Боевая база создана вне Terraform, поэтому несколько настроек включаются руками в консоли один раз.

## Что понадобится

- Доступ в AWS Console → RDS.
- Окно тишины 30 минут (Multi-AZ включается без остановки, но база в это время работает чуть медленнее).
- Терминал с AWS CLI для проверки.

## Шаги

Один раз, настройки базы:
1. AWS Console → **RDS → Databases → `lawbid-prod-postgres` → Modify**.
2. **Availability & durability → Multi-AZ DB instance** (резервный сервер базы в другом здании; цена базы ×2, но авария одного здания не останавливает приложение).
3. **Additional configuration → Backup**: **Backup retention period** 14 days (можно до 35); **Backup window** → Select window → 03:10 UTC, 0.5 hours; **Copy tags to snapshots** включить.
4. **Deletion protection** → Enable (базу нельзя удалить случайно).
5. **Maintenance window**: Sun 04:30 UTC, 1 hour, если пусто.
6. **Continue → Apply immediately → Modify DB instance**.
7. Проверка в Терминале: `aws rds describe-db-instances --db-instance-identifier lawbid-prod-postgres --query 'DBInstances[0].[MultiAZ,BackupRetentionPeriod,DeletionProtection,LatestRestorableTime,KmsKeyId]' --output text`. Ждём `True 14 True` и время не старше 5 минут.

Если пришло письмо о сбое копии (`lawbid-prod-db-backup-age` или «резервная копия базы не сделана»):
8. AWS Console → **AWS Backup → Jobs** → строка с FAILED → **Status message**. Частая причина: копия попала в окно бэкапа или обслуживания RDS. Следующая ночь обычно проходит сама.
9. Два дня подряд FAILED: напишите Claude «бэкап» и приложите текст из Status message. До исправления выкладки с миграциями блокируются сами (проверка «копия не старше 26 часов»).

Восстановление данных (только по вашему явному «да», делает Claude по runbook): всегда в **новый** сервер базы, никогда поверх живой; потом проверка журнала кейсов, повторная отправка событий Stripe и обязательное повторное удаление данных людей, которые просили удалить аккаунт после точки восстановления.

## Как проверить

- **Система → Здоровье системы** → лампочка «Копии базы» зелёная, проверка идёт каждый час.
- Команда из шага 7 показывает `LatestRestorableTime` не старше 5 минут.
- AWS Console → **AWS Backup → Backup vaults → `lawbid-prod-db-dr`** (регион us-west-2): есть точка восстановления за прошлую ночь.
- На **Система → Запуск** строка «Учебное восстановление базы (раз в 90 дней)» зелёная.

## Частые ошибки

- Пропустили письмо о сбое: тревога `db-backup-age` загорается, если за сутки нет ни одной готовой копии. Проверяйте почту владельца.
- Ключ шифрования базы это ключ AWS по умолчанию: копия в отдельный резервный аккаунт невозможна (в другой регион работает). Нужен свой ключ, сказать Claude «перешифровать базу».
- Восстановили базу поверх живой: так нельзя никогда, только в новый сервер.
- Забыли повторить удаления после восстановления: вернутся данные людей, которые просили их удалить. Это нарушение закона о персональных данных.
- Выключить Deletion protection «на минутку»: не нужно ни для чего, кроме удаления базы.
