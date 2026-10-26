# Restore drill log (docs/06 §6.4 — quarterly)

> **Для владельца:** раз в квартал одна команда в терминале Mac (нужен
> вход в AWS: `aws sts get-caller-identity` показывает 047754151252):
>
> ```sh
> scripts/ops/restore-drill.sh            # ≈ 30–60 минут, ≈ $0.10
> ```
>
> Скрипт сам берёт последнюю ночную копию базы, поднимает из неё
> **временную** базу (живая не трогается), проверяет запросом, что данные
> на месте, удаляет временную базу и печатает строку для таблицы ниже.
> Строку вставить в таблицу (или прислать Claude). Ошибка = бэкап нельзя
> считать рабочим, написать Claude «учебное восстановление упало».

Why: AWS Well-Architected
[REL09-BP04](https://docs.aws.amazon.com/wellarchitected/latest/reliability-pillar/rel_backing_up_data_periodic_recovery_testing_data.html)
— a backup is only proven by a restore.

## What the script does

1. Newest automated snapshot of `lawbid-prod-postgres` (`MODE=pitr`: the
   latest restorable second instead).
2. Restore into `lawbid-drill-<date>`: `db.t4g.micro`, single-AZ, not
   public, same subnet group and security groups as production.
3. A fresh random master password on the copy (never the production one).
4. Smoke query from inside the VPC: a one-off ECS task from the
   `lawbid-prod-migrate` task definition (API image, Prisma) — row counts
   of `users`, `cases`, `bids`, `messages`, applied migrations, newest user
   and journal rows. The copy's URL is passed as a task override (visible
   in the ECS console while the task exists; the copy is deleted minutes
   later).
5. Deletes the copy (also on error / Ctrl-C; `KEEP=1` keeps it for manual
   checks — delete it by hand afterwards).
6. Prints the log row: RTO = start → smoke ok, RPO = time of the backup.

## Из хранилища AWS Backup (то, что мы заявляем) — `MODE=backup-vault`

С 2026-10-24 (пакет A). Ночная копия AWS Backup (план
`lawbid-prod-db-daily`, 06:00 UTC) лежит в хранилище `lawbid-prod-db`
(us-east-1) и копией в `lawbid-prod-db-dr` (us-west-2). Проверяем именно
её, а не автоснимок RDS:

```sh
MODE=backup-vault scripts/ops/restore-drill.sh           # главное хранилище, с проверочным запросом
# Копия в другом регионе (нужна группа подсетей RDS в us-west-2):
MODE=backup-vault DR=1 DR_SUBNET_GROUP=<группа-в-us-west-2> scripts/ops/restore-drill.sh
```

Скрипт берёт самую свежую точку восстановления в статусе `COMPLETED`
(`aws backup list-recovery-points-by-backup-vault`), читает её параметры
(`get-recovery-point-restore-metadata`), ставит временное имя
`lawbid-drill-…`, `db.t4g.micro`, без Multi-AZ, не публичную, без защиты от
удаления, запускает `aws backup start-restore-job` и ждёт `COMPLETED`.
Дальше как обычно: свежий пароль, проверочный запрос из VPC, удаление
копии. Для `DR=1` в том регионе у нас нет ECS, поэтому доказательство
«копия поднимается и становится `available`», запрос не выполняется; время
идёт в RTO. Если хранилище пустое, скрипт так и скажет.

### Первая копия вручную (сделано 2026-10-24) и тревога «нет копии»

План создан 2026-10-24, первый ночной запуск 2026-10-25 06:00 UTC. Первую
копию запустили руками:

```sh
aws backup start-backup-job --backup-vault-name lawbid-prod-db \
  --resource-arn arn:aws:rds:us-east-1:047754151252:db:lawbid-prod-postgres \
  --iam-role-arn arn:aws:iam::047754151252:role/lawbid-prod-backup
aws backup list-recovery-points-by-backup-vault --backup-vault-name lawbid-prod-db \
  --query 'RecoveryPoints[].[Status,CreationDate]' --output text   # ждём COMPLETED
aws backup list-recovery-points-by-backup-vault --region us-west-2 --backup-vault-name lawbid-prod-db-dr   # копия в DR
```

Тревога `lawbid-prod-db-backup-age` считает пустой день ошибкой (чтобы
остановившийся план не молчал). Чтобы она **не звонила ложно до первой
копии**, в tfvars на это время стоит `backup_age_missing_data =
"notBreaching"`; **когда первая копия `COMPLETED`, вернуть `"breaching"`
(или удалить строку)** и применить. Нельзя ставить Multi-AZ-конверсию
(вс 04:30-05:30 UTC) вплотную к 06:00: если запись `Modifying`, ночная копия
может не стартовать, и тогда вручную запустить ещё раз.

## Падение основной базы (Multi-AZ) — `FAILOVER=1`

Цель: узнать на деле, сколько секунд приложение не видит базу при потере
зоны, и что пул (PgBouncer, Prisma) переподключается сам. По AWS
([RDS reboot](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_RebootInstance.html))
перезагрузка с отказом имитирует сбой: адрес переключается на запасную зону,
соединения надо открыть заново, простой всё равно есть; AWS советует
сначала остановить транзакции. Типичные 60-120 секунд — цифра сторонних
источников, мы меряем свою.

Условия: база уже Multi-AZ (воскресенье 2026-10-25 по плану), вне пика,
сначала на staging или loadtest:

```sh
DB_ID=lawbid-staging-postgres FAILOVER=1 CONFIRM_OUTAGE=yes \
  HEALTH_URL=https://staging-api.lawbid.dev/health/ready scripts/ops/restore-drill.sh
```

Прод: тот же вызов с `DB_ID=lawbid-prod-postgres ALLOW_PROD=1`, **только с
вашего «да» в чате** и в тихий час. Скрипт: проверяет Multi-AZ, раз в
секунду дёргает `HEALTH_URL`, делает `reboot-db-instance --force-failover`,
ждёт смены зоны и `available`, ещё 30 секунд смотрит, потом печатает
секунды простоя и число неудачных запросов (порог `MAX_OUTAGE_SEC`, по
умолчанию 180). Если простой дольше: смотреть `docs/runbooks/DB_POOLER.md`.
Откат не нужен: RDS сам восстанавливается; если зависло, это видно в
RDS → Events.

| Дата | База | Зона | RDS снова доступна | Простой для людей | Неудачных запросов | Выводы | Кто |
|---|---|---|---|---|---|---|---|
| _ждёт: staging, потом prod после Multi-AZ_ | | | | | | | |

Порядок (план `P0_AND_COST_PLAN.md`, п. 2): вс 2026-10-25 — Multi-AZ и
первая ночная копия; пн — `MODE=backup-vault`, потом `FAILOVER=1` на
staging, потом на prod. **Vault Lock `compliance` включать только после
зачтённого `MODE=backup-vault`.**

Options: `DB_ID`, `CLUSTER` (default `lawbid-prod`), `MODE=snapshot|pitr|backup-vault`, `DR=1`, `DR_REGION`, `DR_SUBNET_GROUP`, `VAULT`,
`DRILL_CLASS`, `AWS_REGION`. Deep comparison with production (needs both
reachable from the Mac): `RESTORED_URL=… PROD_URL=… scripts/ops/restore-drill.sh`.
The daily self-check warns when the last drill is older than 100 days.

| Date | Backup (time) | Target | RTO measured | RPO measured | Checks | Issues / follow-ups | Run by |
|---|---|---|---|---|---|---|---|
| 2026-10-25 | backup-vault: 2026-10-24T23:00:00-07:00 | lawbid-drill-20261025-0644 (db.t4g.micro) | 20 min | newest user row 2026-10-21T19:06:58.441Z | rows ok, migrations ok (116) | backup-vault metadata fixed: keep only restore inputs, Port 0 → 5432 | sima |
