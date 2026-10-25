---
id: aws-rds-parameter-group
title: RDS: параметры базы и перезагрузка
category: aws
cost: Бесплатно (Enhanced Monitoring около $2-3 в месяц)
time: 20 минут
verified: 2026-10-25
sources:
  - AWS: Working with parameter groups | https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_WorkingWithParamGroups.html
  - AWS: Best practices for Amazon RDS PostgreSQL | https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/CHAP_BestPractices.html
  - AWS: Using Enhanced Monitoring | https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_Monitoring.OS.html
  - Репозиторий: docs/runbooks/db-ops.md | https://github.com/syimykkalykov1999/LawBid/blob/main/docs/runbooks/db-ops.md
---

## Что это и зачем

База теперь должна убирать мусор раньше, писать в лог долгие уборки и ожидания блокировок, а для переноса данных между частями базы нужен параметр `rds.logical_replication`. Большинство параметров применяется сразу. Только `rds.logical_replication` требует перезагрузки базы, поэтому его включают в воскресное окно, когда и так перезагружаете базу для Multi-AZ.

## Что понадобится

- Вход в консоль AWS (регион us-east-1) с правом менять RDS.
- База `lawbid-prod-postgres`.
- Воскресное окно (обслуживание: воскресенье 04:30-05:30 UTC).

## Шаги

1. Откройте AWS Console → **RDS** → **Databases** → `lawbid-prod-postgres`, вкладка **Configuration**. Запомните имя в поле **DB parameter group**. Если там `default.postgres16`, создайте свою: **RDS → Parameter groups → Create parameter group**, Family `postgres16`, имя `lawbid-prod-postgres16`.
2. Откройте эту группу, нажмите **Edit** и поставьте значения: `log_autovacuum_min_duration` = `1000`, `log_lock_waits` = `1`, `deadlock_timeout` = `1000`, `track_io_timing` = `1`, `log_temp_files` = `10240`, `autovacuum_vacuum_scale_factor` = `0.05`, `autovacuum_vacuum_insert_scale_factor` = `0.05`, `autovacuum_analyze_scale_factor` = `0.02`. Сохраните кнопкой **Save changes**.
3. Если вы только что создали группу, привяжите её: **Databases → Modify** → **DB parameter group** → ваша группа → **Continue** → **Apply during the next scheduled maintenance window**.
4. В воскресное окно в той же группе поставьте `rds.logical_replication` = `1` (Apply method: **pending-reboot**). Затем **Databases → Actions → Reboot** (с Multi-AZ отметьте **Reboot with failover**, простой около минуты).
5. Enhanced Monitoring по умолчанию ВЫКЛЮЧЕН (платный, около $2-3 в месяц). Чтобы включить через Terraform: в файле `terraform.tfvars` окружения добавьте строку `database_monitoring_interval = 60`, затем скажите Claude «ставь на AWS» (он сделает plan и apply через скрипты). Для базы вне Terraform: **Modify → Monitoring → Enable Enhanced Monitoring**, Granularity `60 seconds`, роль `rds-monitoring-role` (создаётся кнопкой сама).
6. Чтобы версия PostgreSQL не менялась сама: **Modify → Maintenance → Enable auto minor version upgrade** снимите галочку. Новую версию сначала пробуйте на staging.

## Куда вставить в нашей админке

Никуда: это настройки AWS. Пороги проверок базы (размер таблицы, доля мёртвых строк) лежат в админке: **Настройки**, ключи `db.health_table_size_gb` и `db.health_dead_ratio_percent`.

## Как проверить

В консоли у базы в **Configuration** статус группы параметров должен быть **in-sync** (после перезагрузки, а не **pending-reboot**). Через сутки в CloudWatch Logs группы `/aws/rds/instance/lawbid-prod-postgres/postgresql` появятся строки про autovacuum, а в логах воркера строки `db_table_size`. Если в письме тревоги написано `db-dead-tuple-ratio`, смотрите docs/runbooks/db-ops.md.

## Частые ошибки

- Статус **pending-reboot** держится, пока вы не перезагрузили базу: это нормально для `rds.logical_replication`, остальные параметры уже работают.
- Перезагрузка без Multi-AZ даёт простой на несколько минут: делайте её в воскресное окно.
- Параметры группы общие для всех баз с этой группой: проверьте, что она привязана только к нужной базе.
