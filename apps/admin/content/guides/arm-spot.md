---
id: arm-spot
title: Серверы дешевле: ARM64 и Spot
category: system
cost: Экономит деньги: Spot до 70 %, ARM64 около 20 % (оценки AWS, проверяйте в Cost Explorer)
time: 1-2 часа с проверками, по шагам в разные дни
launch: arm_spot
verified: 2026-10-25
sources:
  - AWS: Amazon ECS clusters for Fargate (Fargate Spot) | https://docs.aws.amazon.com/AmazonECS/latest/developerguide/fargate-capacity-providers.html
  - AWS: Fargate pricing | https://aws.amazon.com/fargate/pricing/
  - Репозиторий: docs/runbooks/batch-a-owner.md | https://github.com/syimykkalykov1999/LawBid/blob/main/docs/runbooks/batch-a-owner.md
  - Репозиторий: scripts/ops/arm64-check.sh | https://github.com/syimykkalykov1999/LawBid/blob/main/scripts/ops/arm64-check.sh
---

## Что это и зачем

Два способа платить AWS меньше за те же серверы. ARM64 (процессоры Graviton) примерно на 20 % дешевле за Fargate. Spot это «запасные» мощности со скидкой до 70 %: AWS может забрать сервер, предупредив за 2 минуты, поэтому Spot включают только там, где это не страшно (сначала фоновые задачи worker, потом API). Свет на «Запуске» зелёный, когда включено всё из трёх: ARM64, Spot для API, Spot для фоновых задач.

## Что понадобится

- Готовность делать по порядку и не спешить: Spot для фоновых задач, потом ARM64, потом Spot для API.
- Mac с AWS CLI и Terraform (см. инструкцию «Terraform plan и apply через наши скрипты»).
- Помощь Claude для правок `terraform.tfvars`. Это строки `worker_spot`, `api_spot`, `cpu_architecture`.

## Шаги

1. Spot для worker. Попросите Claude подготовить план. В плане у сервиса `aws_ecs_service.worker` должно быть `update in-place`, а не `must be replaced`. Если `replaced`, стоп.
2. Примените план (инструкция «Terraform plan и apply через наши скрипты»). Сутки смотрите глубину очередей в админке **Система → Здоровье системы**.
3. Проверьте, что все образы собраны под обе архитектуры. После одного деплоя выполните `scripts/ops/arm64-check.sh lawbid-api:<тег> lawbid-admin:<тег> lawbid-pgbouncer:<тег> lawbid-clamav:1.4-debian`. Каждая строка должна быть `OK` и `[amd64,arm64]`.
4. Антивирус ClamAV: в GitHub откройте **Actions** → **Mirror ClamAV** → **Run workflow**. Он копирует нужный образ в наш ECR. Затем Claude подставит `clamav_image` в `terraform.tfvars`.
5. ARM64 сначала на staging: `cpu_architecture = "ARM64"`, plan, apply, проверьте, что загрузка файла проходит антивирус. Потом то же на проде. Откат: убрать строку и применить.
6. Spot для API (`api_spot = true`) включайте позже и не раньше, чем будет исправлен запас подключений к базе (так записано в runbook).

## Куда вставить в нашей админке

Ничего вставлять не нужно. Настройки живут в Terraform.

## Как проверить

На **Система → Запуск** строка «Серверы дешевле: ARM64 и Spot» покажет, например, «ARM64, Spot: API да, фоновые задачи да.» Зелёная: включено всё. Жёлтая: включено частично. Красная: ничего. Через неделю загляните в **Система → Расходы**: счёт за ECS должен снизиться.

## Частые ошибки

- Включили ARM64, а какой-то образ не умеет arm64: задача не стартует. Поэтому сначала `arm64-check.sh`.
- Spot без паузы: при нехватке мощностей задачи Spot ждут, AWS не подменяет их обычными. Следите за очередями.
- Пытаться включить всё за один раз. Делайте по одному шагу и смотрите здоровье системы.
- Цены Spot и ARM меняются. Реальную экономию смотрите в Cost Explorer, а не в наших оценках.
