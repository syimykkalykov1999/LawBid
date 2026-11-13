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

## A2. Spot для всех пяти сервисов и запасной путь (владелец 12.11, строка 67)

С 12.11 вместо ручных шагов из A — админка → «Расходы» → «Дешёвые серверы (Graviton ARM и Spot)» → Вкл (код 2FA).

- Сервисы: `api` (приложение и сайт), `api-admin`, `admin`, `worker`, `pgbouncer`.
  У каждого одна копия всегда на обычном Fargate (`base = 1`), добавленные
  копии `FARGATE` вес 1 : `FARGATE_SPOT` вес 4 (≈ 80 % на Spot).
- **Первое включение пересоздаёт эти пять сервисов** (смена `launch_type`,
  KNOWN_ERRORS 119): несколько минут простоя, делать до запуска.
- AWS сам не заменяет Spot обычными серверами. Это делает Lambda
  `<стек>-spot-fallback` (`infra/modules/spot-fallback`): событие
  `SERVICE_TASK_PLACEMENT_FAILURE` на `FARGATE_SPOT` → у этого сервиса вес
  Spot 0 и скользящее обновление (недостающие копии на обычном Fargate);
  каждые 5 минут — запасная проверка (копий меньше, чем нужно, и в событиях
  сервиса «Capacity is unavailable») и возврат: после 30 минут тишины
  (после повторов 60, 120 … до 6 часов) — снова 1:4 и скользящее
  обновление, старые копии уходят только после готовности новых.
- Положение в админке «Настройки» → `scale.spot_fallback.mode`: `auto`
  (по умолчанию), `on` — держать всё на обычных серверах, `off` — не
  вмешиваться. Аварийный выключатель самой Lambda: SSM
  `/<стек>/spot-fallback/mode` = `on | dry-run | off`.
- Потолок копий: «Настройки» → `scale.max_tasks.api`, `.worker`,
  `.api_admin`, `.admin`, `.pgbouncer` — по 100, верхней границы нет.
  Растут только по нагрузке (прежние правила target tracking).
- Terraform не трогает стратегию после создания (`ignore_changes`), чтобы
  применение не отменило переход на обычные серверы.

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
