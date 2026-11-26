---
id: cache-cdc
title: Сброс кэша по журналу базы: включить
category: system
cost: Бесплатно (часть базы и фонового обработчика; журнал для чтения держится на диске базы, потолок 2048 МБ)
time: 20 минут плюс воскресное окно для перезагрузки базы
runbook: cache-cdc.md
verified: 2026-11-25
sources:
  - Facebook: Scaling Memcache at Facebook (NSDI 2013) | https://www.usenix.org/conference/nsdi13/technical-sessions/presentation/nishtala
  - Uber: How Uber Serves Over 40 Million Reads Per Second Using an Integrated Cache | https://www.uber.com/blog/how-uber-serves-over-40-million-reads-per-second-using-an-integrated-cache
  - AWS: Working with parameter groups | https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_WorkingWithParamGroups.html
  - PostgreSQL: Logical Replication | https://www.postgresql.org/docs/current/logical-replication.html
  - Репозиторий: docs/runbooks/cache-cdc.md | https://github.com/syimykkalykov1999/LawBid/blob/main/docs/runbooks/cache-cdc.md
---

## Что это и зачем

Приложение хранит готовые ответы в быстрой памяти (Valkey) и само стирает их, когда что-то меняется. Если строку в базе поменяли мимо приложения (например, командой в консоли), старый ответ жил до 5 минут. Теперь фоновый обработчик читает журнал изменений базы и сам стирает такие ответы, как у Facebook и Uber. Пока переключатель «Выкл», всё работает как раньше.

## Что понадобится

- Вход в консоль AWS (регион us-east-1) с правом менять RDS.
- Воскресное окно для перезагрузки базы (около минуты простоя с Multi-AZ).
- Доступ к админке с правом владельца.

## Шаги

1. С 26.11 это делает «Авто» само: строка «Журнал изменений базы для сброса кэша (подготовка)» на странице **Масштаб** включается сама, когда серверов API не меньше `infra.cdc_prepare_on_api_tasks` (4). Не хотите ждать — нажмите там **Вкл** и подтвердите кодом 2FA. Само не выключается. Дальше «Авто» не может: перезагрузка базы и право ниже — ваши шаги.
2. В воскресное окно: AWS Console → **RDS** → **Databases** → `lawbid-prod-postgres` → **Actions** → **Reboot**, отметьте **Reboot with failover**. Параметр `rds.logical_replication` начинает работать только после перезагрузки.
3. AWS Console → **RDS** → **Query Editor** → подключитесь главным пользователем базы → выполните `GRANT rds_replication TO lawbid_app;` → **Run**.

## Куда вставить в нашей админке

Админка → **Настройки** → ключ `db.cdc_mode` → **Авто** → «Сохранить». Остальное по умолчанию: `db.cdc_max_slot_wal_mb` = 2048, `db.cdc_lag_alarm_sec` = 120.

## Как проверить

Через минуту: «Здоровье системы» → строка «Сброс кэша по журналу базы» зелёная, написано «primary: работает». Если жёлтая и написано, чего не хватает (логическая репликация, право `rds_replication`), повторите нужный шаг.

## Частые ошибки

- Забыли перезагрузить базу: строка пишет «ждёт, когда в базе включат логическую репликацию».
- Пришло письмо «replication-slot-lag»: поставьте `db.cdc_mode` на **Выкл**, место чтения удалится само за минуту, и напишите Claude.
