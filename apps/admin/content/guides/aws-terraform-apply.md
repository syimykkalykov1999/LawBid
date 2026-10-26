---
id: aws-terraform-apply
title: Terraform plan и apply через наши скрипты
category: launch
cost: Бесплатно сам по себе; изменения в AWS могут стоить денег (смотрите план)
time: 20-40 минут
verified: 2026-10-25
sources:
  - Terraform: terraform plan | https://developer.hashicorp.com/terraform/cli/commands/plan
  - Terraform: terraform apply | https://developer.hashicorp.com/terraform/cli/commands/apply
  - Репозиторий: docs/runbooks/DEPLOY_PROD.md | https://github.com/syimykkalykov1999/LawBid/blob/main/docs/runbooks/DEPLOY_PROD.md
  - Репозиторий: scripts/deploy/plan-guard.sh | https://github.com/syimykkalykov1999/LawBid/blob/main/scripts/deploy/plan-guard.sh
  - Репозиторий: docs/runbooks/AWS_CLEANUP.md | https://github.com/syimykkalykov1999/LawBid/blob/main/docs/runbooks/AWS_CLEANUP.md
---

## Что это и зачем

Terraform описывает всю нашу инфраструктуру AWS файлами в папке `infra/`. Команда `plan` показывает, что изменится, а `apply` меняет. Сначала всегда `plan`, и только потом `apply` именно этого плана. Это самый рискованный ручной шаг, поэтому у нас есть защитный скрипт `plan-guard.sh`. Обычно этим занимается Claude или разработчик, а вы читаете итог плана и говорите «да».

## Что понадобится

- Mac с установленными `terraform`, `jq` и AWS CLI, с входом в AWS (проверка: `aws sts get-caller-identity`, должен показать наш аккаунт).
- Файлы `backend.hcl` и `terraform.tfvars` в `infra/envs/prod` (по образцам `backend.hcl.example` и `terraform.tfvars.example`; в репозиторий они не попадают).
- Свежая `main`: `git pull`.

## Шаги

1. Откройте Terminal и перейдите в папку проекта, затем в `infra/envs/prod`.
2. Подставьте теги образов, которые сейчас работают на проде, иначе Terraform вернёт старую версию: `../../../scripts/deploy/current-tag.sh`. Он обновит `api_image` и `admin_image` в `terraform.tfvars`.
3. Выполните `terraform init -backend-config=backend.hcl`.
4. Выполните `terraform plan -out=plan.bin`. Это только чтение, ничего не меняется.
5. Выполните `../../../scripts/deploy/plan-guard.sh plan.bin`. Скрипт падает со словом `STOP`, если план удаляет базу, секреты, ключи KMS, Redis, хранилища S3 или хранилища бэкапов. При `STOP` дальше не идите, покажите вывод Claude.
6. Прочитайте итог плана, строку `Plan: X to add, Y to change, Z to destroy`. Нормально: добавления и изменения «in-place». Подозрительно: любое `destroy` или `must be replaced`, особенно у `aws_ecs_service`, базы и секретов.
7. Если всё понятно и вы согласны с расходами, выполните `terraform apply plan.bin`. Применяется именно проверенный файл плана.
8. Проверьте сайт: `curl -fsS https://api.lawbid.dev/health/ready` и откройте **Система → Запуск** в админке.

Для первичной очистки AWS от лишнего есть отдельный путь, см. docs/runbooks/AWS_CLEANUP.md (скрипты `scripts/aws/inventory.sh` и `scripts/aws/cleanup.sh`, сначала только осмотр).

## Куда вставить в нашей админке

Ничего вставлять не нужно.

## Как проверить

Команда `terraform plan` сразу после применения должна сказать `No changes`. На **Система → Запуск** не должны покраснеть строки, которые были зелёными. Отдельного света для этого шага нет.

## Частые ошибки

- `apply` без свежего `plan` или без `plan-guard.sh`: так можно потерять данные.
- Забыли `current-tag.sh`: прод откатится на старую версию приложения.
- База у нас вне Terraform (управляется в консоли RDS), поэтому изменения базы здесь не ждите.
- Нет доступа к AWS (`ExpiredToken`): войдите заново и повторите с шага 3.
- Подробности и порядок для особых случаев смотрите в docs/runbooks/DEPLOY_PROD.md.
