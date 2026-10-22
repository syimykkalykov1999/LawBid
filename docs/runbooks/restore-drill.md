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

Options: `DB_ID`, `CLUSTER` (default `lawbid-prod`), `MODE=snapshot|pitr`,
`DRILL_CLASS`, `AWS_REGION`. Deep comparison with production (needs both
reachable from the Mac): `RESTORED_URL=… PROD_URL=… scripts/ops/restore-drill.sh`.
The daily self-check warns when the last drill is older than 100 days.

| Date | Backup (time) | Target | RTO measured | RPO measured | Checks | Issues / follow-ups | Run by |
|---|---|---|---|---|---|---|---|
| _pending — first drill before launch (owner: `scripts/ops/restore-drill.sh`)_ | | | | | | | |
