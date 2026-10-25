# ARM64 (Graviton) и Spot для worker: один порядок действий

**Ничего не включено.** Это порядок для владельца; каждый шаг можно остановить.
Собрано из `batch-a-owner.md` §6, `DEPLOY_PROD.md` (ARM64) и опыта с Spot:
**через Terraform смена стратегии провайдеров ёмкости заставила провайдера
пересоздать сервис** (простой), поэтому Spot включаем вручную через AWS CLI,
потом синхронизируем Terraform.

Сначала Spot (проще, обратимо), потом ARM64. Между ними минимум сутки.

## A. Worker на Spot без простоя

1. Убедиться, что очередь спокойна: админка → Здоровье системы, глубина
   очередей близка к нулю. У контейнера worker `stopTimeout = 120` (спокойно
   доработает задачу за 2 минуты предупреждения Spot).
2. Текущее состояние (только чтение):

   ```sh
   aws ecs describe-services --cluster lawbid-prod --services worker \
     --query 'services[0].[launchType,capacityProviderStrategy,desiredCount,runningCount]'
   ```

3. Переключить сервис вручную, одной командой: одна задача (base 1) остаётся на
   обычном Fargate, остальные пополам Spot:

   ```sh
   aws ecs update-service --cluster lawbid-prod --service worker \
     --capacity-provider-strategy capacityProvider=FARGATE,base=1,weight=1 capacityProvider=FARGATE_SPOT,base=0,weight=1 \
     --force-new-deployment
   aws ecs wait services-stable --cluster lawbid-prod --services worker
   ```

   Это обычное скользящее обновление: новые задачи поднимаются, старые уходят
   после готовности.
4. Выровнять Terraform с тем, что уже есть. В tfvars `worker_spot = true`, затем
   **только** `refresh-only`, без изменения сервиса:

   ```sh
   scripts/deploy/plan-guard.sh   # обычный план через защиту
   terraform apply -refresh-only
   ```

   Затем обычный `plan`: у `aws_ecs_service.worker` должно быть **«No changes»**
   или `update in-place`. Если видно `must be replaced` — **стоп, не применять**,
   написать Claude (сервис уже работает, ничего срочного нет).
5. Сутки смотреть очереди и сигнал `…-worker-no-running-tasks`. Откат:
   команда из п.3 с `capacityProvider=FARGATE,base=1,weight=1` (без Spot) +
   `--force-new-deployment`, затем в tfvars `worker_spot = false` и снова
   `refresh-only`.

`api_spot` — не раньше исправления бюджета подключений к БД.

## B. ARM64 (≈ −20 % за Fargate)

Порядок важен: иначе задача не запустится.

1. Один деплой после слияния multi-arch `deploy.yml` (образы amd64 + arm64).
2. Зеркало ClamAV (в `clamav/clamav:1.4` только amd64): GitHub → Actions →
   **Mirror ClamAV** → Run workflow (источник `clamav/clamav-debian:1.4`, тег
   `1.4-debian`; повтор безопасен, теги неизменяемы). Затем в tfvars
   `clamav_image = "<ECR>/lawbid-clamav:1.4-debian"`; применить **до** ARM64 и
   проверить, что загрузка файла проходит антивирус на x86.
3. Проверка образов, только чтение — все четыре строки `OK [amd64,arm64]`:

   ```sh
   scripts/ops/arm64-check.sh lawbid-api:<тег> lawbid-admin:<тег> \
     lawbid-clamav:1.4-debian lawbid-pgbouncer:<тег>
   ```

4. Сначала staging: `cpu_architecture = "ARM64"` → `plan` через plan-guard →
   `apply` → проверить загрузку файла, вход, чат.
5. Потом prod: те же шаги. Fargate заменяет задачи по очереди (обновление
   сервисов; пересоздания самих сервисов быть не должно — это смена
   определения задачи). Откат: `cpu_architecture = "X86_64"`, apply.
6. Через сутки сравнить расходы в Cost Explorer (по тегу `Component`, см.
   `cost.md`).

Цены (Spot до −70 %, ARM ≈ −20 %) — оценки AWS и сторонних источников:
проверять по счёту, не по обещанию.
