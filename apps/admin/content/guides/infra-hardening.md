---
id: infra-hardening
title: Укрепление облака: отдельная роль для кнопок, копии в другом регионе, лимиты WAF
category: system
cost: Тревоги и защита от удаления бесплатно. Копии медиа и бэкапов во втором регионе - цена хранения (≈ размер данных). Правила WAF $1 за правило в месяц. Вторая зона ≈ +$80 в месяц
time: 20-40 минут на один пункт (оценка); пункты независимы, делать по одному
runbook: infra-hardening.md
verified: 2026-10-27
sources:
  - Репозиторий: docs/runbooks/infra-hardening.md | https://github.com/syimykkalykov1999/LawBid/blob/main/docs/runbooks/infra-hardening.md
  - Amazon RDS: копии бэкапов в другой регион | https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_ReplicateBackups.html
  - Amazon S3: репликация | https://docs.aws.amazon.com/AmazonS3/latest/userguide/replication.html
  - AWS WAF: правила по частоте запросов | https://docs.aws.amazon.com/waf/latest/developerguide/waf-rule-statement-type-rate-based.html
---

## Что это и зачем

Аудит облака нашёл места, где один сбой или один взлом задевает слишком много. Исправления готовы в коде, но **выключены**: каждое включается одной строкой в `terraform.tfvars` прода и «ставь на AWS». Вы решаете, что и когда включать. Всегда сначала `terraform plan` и смотреть, что нет удалений и замен.

Что применится само при обычном apply, без решений: новые тревоги (инструкция infra-alarms), защита балансировщика от удаления, копия фото во второй регион (включена по умолчанию в prod).

## Что понадобится

- Mac с Terraform и входом в AWS, свежий `git pull`, папка `infra/envs/prod`.
- Копия `terraform.tfvars` в Secrets Manager (после каждой правки загружайте обновлённую).
- Тихое время (ночь по США) для пунктов, которые перезапускают серверы.

## Шаги

Пункты по пользе на деньги. Каждый - отдельный plan и apply.

1. **Отдельная роль для админских кнопок (ops).** Сейчас сервер API умеет менять базу и Redis напрямую: взлом API = взлом базы. Решение: права «Масштаб / Запуск / Расходы» выносятся на отдельную роль, которую код берёт на 15 минут только для кнопок. Порядок важен: сначала выкатить релиз с кодом; потом в tfvars `ops_role_external_id` (32+ случайных символов) и `ops_role_split = true`; plan должен показать роль `lawbid-prod-ops`, секрет и правку политики; apply. Проверка: **Масштаб** → «Перезапустить worker» работает. Откат: `ops_role_split = false`.
2. **Вторая зона AWS.** Сейчас всё в одной зоне: если она упадёт, новые серверы не запустятся. Три строки: `nat_per_az = true`, `interface_endpoint_azs = 2`, `api_min_tasks = 2` (≈ +$80 в месяц). Подробно в инструкции nat-endpoints.
3. **База под управлением Terraform.** `adopt_existing_database = true`; plan должен показать «1 to import» и отличия только по Multi-AZ, сроку бэкапов, защите от удаления, Performance Insights. Если plan хочет **replace** - остановиться и написать Claude. После включения Multi-AZ в консоли поставить `database_multi_az = true`.
4. **Копии базы в другой регион.** `rds_cross_region_backups = true`: снимки и журнал транзакций копируются в us-west-2, восстановление на любую секунду там. Срок `rds_cross_region_backup_retention_days` (14). Проверка: консоль RDS → **Automated backups** → **Replicated**.
5. **Копия фото и документов.** `replicate_media = true` уже стоит в prod, но копируются только новые файлы. Старые один раз: консоль S3 → корзина `lawbid-prod-media` → **Management** → **Replication rules** → `media-to-replica` → **Create replication job**. Удалённое в копии остаётся 90 дней: случайно стёртое фото можно вернуть.
6. **Балансировщик без «липкости».** `alb_websocket_target_group = true`: отдельная группа только для сокетов, остальные запросы распределяются по наименее занятому серверу. Внимание: ECS-сервис api пересоздаётся (короткий перебой) - делать в тихое время.
7. **Лимиты WAF против перебора кодов.** `waf_device_header = "x-device-id"` (+2 правила) и `waf_auth_rules_enabled = true` (+1-2 правила), по $1 за правило в месяц. При включении поднять `waf_otp_rate_limit_per_5m` с 20 до 60. Новые правила сначала в режиме `count` (только считают): неделю смотреть метрики WAF, потом `waf_auth_rate_action = "block"`.
8. **Роль деплоя строже.** `deploy_trust_main_branch = false` в `infra/bootstrap`. **До этого** добавить `environment: production` в workflow `deploy.yml`, `web-deploy.yml`, `seo-deploy.yml`, `self-check.yml`, `aws-inventory.yml`, иначе они перестанут входить в AWS.
9. **Копия состояния Terraform.** `state_replica_enabled = true` в `infra/bootstrap`, потом дать роли drift-проверки `kms:Decrypt` на новый ключ.
10. **Защита балансировщика от удаления** уже включена. Чтобы осознанно удалить: сначала `alb_deletion_protection = false`, apply.

## Как проверить

- Пункт 1: в CloudTrail событие `AssumeRole` для `lawbid-prod-ops` после нажатия кнопки на **Масштаб**.
- Пункт 4: RDS → Automated backups → Replicated показывает us-west-2.
- Пункт 5: S3 → корзина-копия в us-west-2 растёт по числу объектов.
- Пункт 7: WAF → метрики правил `otp-rate-per-ip-device`, `auth-login-rate-per-ip` считают запросы.
- В админке **Здоровье системы** после каждого apply остаётся зелёным; если нет - откатите последний пункт.

## Частые ошибки

- Сделали пункт 1 в обратном порядке (tfvars раньше релиза): кнопки на **Масштаб** перестанут работать. Откат `ops_role_split = false`.
- Пункт 8 без правки workflow: выкладки падают на входе в AWS.
- Plan показывает replace базы: никогда не подтверждайте, это пересоздание базы.
- Пункт 6 днём: пользователи увидят короткий перебой.
- Честно про роль ops: кто полностью захватил сервер API, прочитает и секрет роли; защита закрывает кражу учётных данных, а не полный взлом.
