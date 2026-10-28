# Инвентаризация зависимостей от AWS и платных облаков (переезд на свои серверы)

Дата: 2026-10-28. Только чтение кода и инфраструктуры, ничего не менялось. Источники: `infra/` (Terraform, 36 модулей, ~16 000 строк, 9 провайдеров `aws`), `apps/api` (SDK `@aws-sdk/*`, переменные окружения), `apps/admin`, `apps/mobile`, `.github/workflows` (26 файлов), `scripts/`, `docs/runbooks/VENDORS.md`. Граф `graphify-out` в репозитории отсутствует, поэтому поиск шёл по файлам напрямую.

## Резюме для владельца (по-русски)

**Сколько всего.** 34 позиции у AWS и 24 у других платных поставщиков. Из 34 позиций AWS: 16 лёгких, 12 средних, 6 тяжёлых.

**Общая готовность к переезду: около 40 %.**
- Данные и приложение: около 65 %. Приложение работает на обычных Postgres и Redis, файлы читаются через S3-совместимый адрес (`S3_ENDPOINT`; тот же приём уже работает с Cloudflare R2), образы Docker переносимы, почта/SMS/видео/поиск стоят за переключателями.
- Инфраструктура как код: около 0 %. Все 36 модулей Terraform написаны под AWS и при переезде пишутся заново (Docker Compose/Nomad/Kubernetes плюс Ansible/OpenTofu).
- Операционный код (админка «Масштаб», «Здоровье системы», автомасштаб, бэкапы): около 20 %. Он вызывает API ECS, RDS, ElastiCache, CloudWatch, Backup, SSM напрямую и без этих сервисов показывает «только на AWS».

**Пять самых тяжёлых мест.**
1. База PostgreSQL (RDS): переезд без потерь через логическую репликацию, свой Patroni и бэкапы. Риск средний, но это самое ценное.
2. Приватные документы (S3 + KMS + подписанные ссылки CloudFront): шифрование, права, подпись ссылок, Macie. Все `File`-строки хранят бакет и ключ, поэтому важно сохранить имена.
3. Ключи шифрования (KMS и Secrets Manager): чат и ключи админки зашифрованы «обёрнутыми» KMS ключами. Нужно один раз расшифровать и перевернуть в Vault без простоя.
4. Оркестрация и весь Terraform (ECS Fargate, ALB, автомасштаб, Cloud Map, 6 Lambda, NAT/VPC): полностью переписывается; плюс сам админский код, который управляет ECS/RDS.
5. Почта (SES → свой MTA): техническая часть простая (в коде есть интерфейс), но репутация IP и «разогрев» занимают недели. Рядом по сложности CDN: свой «край» по миру заменить трудно (рекомендация: Bunny или Cloudflare CDN перед своим origin).

**Что нельзя поднять у себя вообще** (не блокирует переезд, но остаётся платной зависимостью): Apple APNs и Google FCM (пуши), Stripe (деньги), Apple Developer и Google Play (магазины), регистратор домена. Остальное (Cloudflare TURN/SFU/R2, Bunny, Twilio, Sentry, PagerDuty, Persona и т.д.) заменимо; первые три из них уже имеют готовый запасной путь в коде (свой coturn и LiveKit есть в Terraform).

**Объёмы данных сегодня.** Продукт ещё до публичного запуска (Stripe в тестовом режиме, БД `db.t4g.micro`, Redis `cache.t4g.micro`), точные цифры в документах не записаны. Перед переездом надо снять реальные размеры (команды в разделе «Как измерить объёмы»). Ориентир: база и бакеты измеряются единицами и десятками ГБ, не терабайтами.

**Следующий шаг.** Выбрать целевую схему (одна «своя» площадка плюс Cloudflare/Bunny как CDN), затем по порядку: 1) бэкапы и реплика Postgres у себя, 2) зеркало S3 в MinIO, 3) ключи в Vault, 4) параллельный запуск контейнеров, 5) переключение DNS, 6) выключение AWS после недели наблюдения.

---

## 0. Как читать таблицы

- Сложность: **низкая** (адаптер/переключатель есть, дни), **средняя** (код адаптируется, недели), **высокая** (переписывание или риск потерь, месяцы либо длинный прогрев).
- Связность: «адаптер есть» значит интерфейс в коде и второй вариант (mock или другой провайдер) уже существует; «переключатель» значит выбор через env или настройку админки; «жёсткая» значит вызовы SDK прямо из бизнес-кода или ops-сервисов.
- Все пути относительно корня репозитория.

## 1. AWS: полный список (34 позиции)

### 1.1 Вычисления и сеть

| # | AWS сервис | Для чего (просто) | Где в коде/инфре | Данные (объём) | Связность | Свой аналог | Сложность | Перенос без потерь |
|---|---|---|---|---|---|---|---|---|
| 1 | ECS Fargate (api, worker, admin, pgbouncer, ClamAV-sidecar, миграции) | Запускает все наши контейнеры и добавляет копии при нагрузке | `infra/modules/ecs`, `infra/modules/stack/main.tf`, `scripts/deploy/*.sh` (`ecs run-task`, `update-service`), `.github/workflows/deploy.yml`, `rollback.yml`; код: `apps/api/src/common/ops/aws-ops.service.ts` | Данных нет (без состояния); до 50 api и 20 worker задач потолок | Образы Docker портируемы; оркестрация жёсткая (task definitions, circuit breaker, autoscaling) | Nomad или Kubernetes (k3s) либо Docker Swarm/Compose на 2-3 серверах | высокая | Параллельный запуск тех же образов на новых серверах за новым балансировщиком, потом смена DNS; состояние не нужно переносить |
| 2 | ECR | Хранит образы Docker (`lawbid-api`, `-admin`, `-pgbouncer`, clamav-зеркало) | `infra/modules/ecs` (ecr repo), `.github/workflows/deploy.yml`, `build-pgbouncer.yml`, `mirror-clamav.yml`, `scripts/deploy/prod-images.sh` | Десятки образов, до нескольких ГБ | Жёсткая в workflows; в образах нет | Harbor или GHCR/GitLab Registry | низкая | `skopeo copy --all` по digest, затем проверка cosign-подписей (`cosign verify`) |
| 3 | ALB (Application Load Balancer) | Принимает HTTPS-трафик, держит WebSocket, раздаёт на api/admin | `infra/modules/alb`, `infra/modules/stack/main.tf` | Нет (логи в бакет аудита) | Жёсткая в Terraform; приложению всё равно, кто стоит перед ним | HAProxy или Nginx/Traefik + keepalived/VIP | средняя | Новый балансировщик живёт параллельно; нужны sticky-сессии для api и таймаут 300 с для WebSocket |
| 4 | VPC, подсети, NAT, VPC endpoints, Cloud Map, EIP, flow logs, Security Groups | Закрытая сеть, выход в интернет, внутренние имена (`pgbouncer.<name>.internal`) | `infra/modules/network`, `infra/modules/pgbouncer`, `infra/modules/endpoints-autoscale`, `docs/runbooks/nat-endpoints.md` | Нет | Жёсткая (только Terraform) | WireGuard/VLAN + nftables, Consul или CoreDNS для имён | средняя | Строится заново; проверить, что app ходит по DNS-именам, а не по IP |
| 5 | EC2 (TURN, LiveKit, loadgen) | Свои relay-серверы для звонков и нагрузочные тесты (сейчас выключены: `turn_enabled=false`, `livekit_enabled=false`) | `infra/modules/turn`, `infra/modules/livekit`, `infra/modules/loadgen`, `docs/runbooks/TURN.md`, `LIVEKIT.md` | Нет | Уже в виде coturn и livekit-server (открытый код) | coturn, LiveKit на своих серверах | низкая | Конфиг и user-data готовы, поднять на новом железе |
| 6 | Auto Scaling (Application Auto Scaling, scheduled actions) | Автоматически меняет число задач по CPU и длине очереди | `infra/modules/ecs` (`worker_queue`), `infra/modules/stack`; код: `aws-ops.service.ts`, метрика `QueueWaitingTotal` | Нет | Жёсткая | KEDA (Kubernetes) или Nomad Autoscaler + Prometheus | средняя | Правила переписать на Prometheus-метрики; потолки «Экономики» хранить в `app_config` |

### 1.2 Данные

| # | AWS сервис | Для чего | Где | Данные | Связность | Свой аналог | Сложность | Перенос без потерь |
|---|---|---|---|---|---|---|---|---|
| 7 | RDS PostgreSQL 16 (Multi-AZ, реплики, PITR, Performance) + RDS Proxy (опция) | Главная база: пользователи, дела, ставки, сообщения, деньги, журнал | `infra/modules/postgres`, `infra/modules/stack/main.tf`, `infra/modules/growth` (реплики, proxy), `infra/postgres/role-settings.sql`; код: `apps/api/src/common/ops/aws-capacity.service.ts` (ModifyDBInstance), `apps/api/src/prisma/replica-admin.service.ts`, `apps/api/src/modules/admin-ops/restore-drill.service.ts`; `scripts/deploy/prod-db-*.sh` | Не записан; `db.t4g.micro`, предзапусковая стадия; разделы партиционирования/шардирования подготовлены (`docs/architecture/SHARDING_READY.md`) | Приложение говорит с обычным Postgres через `DATABASE_URL` (Prisma); админские «увеличить/реплика» жёстко на RDS API | PostgreSQL 16 + Patroni (etcd) + pgBackRest + PgBouncer (свой образ уже есть) | **высокая** (по ценности) | Логическая репликация (`CREATE PUBLICATION` на RDS, `SUBSCRIPTION` у себя) или `pg_basebackup`-подобно через pgBackRest + WAL; сверка `count(*)` и хэшей по таблицам; короткое окно записи только для финального переключения; РОЛИ (`lawbid_migrator/app/retention/readonly`) воссоздать скриптом `prod-db-setup.sh`; RDS оставить как fallback неделю |
| 8 | ElastiCache Redis 7 (2 группы: очереди/кэш, TLS, AUTH, Multi-AZ, replica) | Очереди BullMQ, кэш, блокировки, лимиты, realtime-комнаты | `infra/modules/redis`, `infra/modules/redis-autoscale`, `docs/architecture/REDIS_AUTOSCALE.md`, `REDIS_CLUSTER_READY.md`; код: `aws-capacity.service.ts` (ModifyReplicationGroup), `apps/api/src/redis/` | Временные; очереди восстановимы, потеря кэша не страшна | Приложение: обычный `REDIS_URL`; админский масштаб жёсткий | Valkey/Redis + Sentinel (или Cluster; код к нему подготовлен) | низкая | Очереди дренировать (остановить worker, дождаться пустоты) и стартовать на новом; постоянных данных в Redis нет, кроме флагов breaker и ключей сессий, которые допустимо потерять |
| 9 | S3 (документы, медиа, веб, статус-страница, аудит-логи, Terraform-state, зеркала) | Файлы пользователей, статика веб-приложения, архив аудита | `infra/modules/s3`, `modules/web`, `modules/status-page`, `modules/audit-logs`, `infra/bootstrap`; код: `apps/api/src/modules/files/storage/s3-storage.service.ts`, `apps/api/src/modules/public-directory/seo-web-store.ts`, `common/streaming/export-stream.ts`, `modules/admin/audit-export.service.ts`, `common/ops/status/public-status.service.ts`; `scripts/deploy/web-*.sh`, `.github/workflows/web-deploy.yml`, `seo-deploy.yml` | Не записан; бакеты: documents (private, версионирование, cross-region replica), media (public + OAC), web, status, audit (Object Lock опция), state | **Адаптер есть:** `S3_ENDPOINT`/`S3_REGION`/`S3_ACCESS_KEY_ID` (S3-совместимый клиент, уже работает с R2); при этом presigned POST и подписанные ссылки CloudFront жёстко AWS | MinIO (или Ceph RGW/SeaweedFS), Object Lock поддерживается MinIO | **высокая** (документы) / низкая (медиа, веб) | `rclone sync`/`mc mirror` с проверкой хэшей, затем `s3.checksum` сверка; в БД `File.s3_bucket` + `s3_key` — сохранить те же имена бакетов или одним SQL заменить; SSE-KMS объекты читаются при копировании расшифрованными и записываются в MinIO с SSE (KES/Vault); перенос версий (`mc mirror --preserve`) и Object Lock аудита отдельно; финальная дельта после остановки загрузок |
| 10 | AWS Backup (+ restore testing, vault lock, копия в другой регион) | Ежедневные копии базы, ежемесячная проверка восстановления | `infra/modules/backup`; код: `modules/admin-ops/restore-drill.service.ts` (ListRestoreJobs), `scripts/ops/restore-drill.sh`, `docs/runbooks/backups.md` | Копии 14+ дней, второй регион (us-west-2) | Жёсткая (UI «Восстановление» читает AWS Backup) | pgBackRest/Barman + WAL-G в MinIO/S3 на другом сайте + cron-проверка восстановления | средняя | Не переносить копии: сделать свежий полный бэкап уже у себя, старые AWS-копии держать до конца срока хранения |
| 11 | OpenSearch (Serverless/domain), выключено | Отдельный поисковый движок (включается переключателем `search.engine`) | `infra/modules/opensearch-serverless`, `infra/modules/growth`; код: `apps/api/src/modules/search`, env `OPENSEARCH_*`; `docs/architecture/SEARCH_READY.md` | Сейчас пусто (`search.engine=postgres`) | Адаптер есть | OpenSearch (Apache-2.0) или Meilisearch/Typesense | низкая | Переключатель `shadow`, индекс перестраивается из Postgres; переносить нечего |
| 12 | Kinesis Data Streams, выключено | Поток доменных событий для аналитики (`events.sink=stream`) | `infra/modules/stack/events_stream.tf`; код: `apps/api/src/modules/events/event-stream.publisher.ts` (ленивый SDK) | Пусто; события также лежат в таблице `domain_events` | Адаптер есть, SDK загружается лениво | Redpanda/Kafka или NATS JetStream | низкая | Оставить `events.sink=db`; ничего не теряется, строки хранятся в БД |
| 13 | DynamoDB | Только блокировка состояния Terraform | `infra/bootstrap`, `backend.hcl.example` | Крошечные | Только IaC | Удалится вместе с Terraform/AWS | низкая | Новое состояние IaC хранить в MinIO/Git |

### 1.3 Доставка, почта, медиа

| # | AWS сервис | Для чего | Где | Данные | Связность | Свой аналог | Сложность | Перенос без потерь |
|---|---|---|---|---|---|---|---|---|
| 14 | CloudFront (web, media CDN, private signed docs, KeyValueStore, Functions, мониторинг) | Быстрая раздача веба и фото по миру; подписанные ссылки на приватные файлы | `infra/modules/web`, `modules/cdn-waf`, `modules/s3`, `modules/status-page`; код: `s3-storage.service.ts` (`@aws-sdk/cloudfront-signer`), `files/storage/cloudfront-invalidation.client.ts`, `common/cdn/cdn-invalidator.ts`; env `CLOUDFRONT_*`, `MEDIA_CDN_BASE_URL`; `scripts/deploy/web-*.sh`, workflows `web-deploy.yml`, `seo-deploy.yml` (invalidation, KeyValueStore) | Кэш (данных нет); `docs/architecture/CLOUDFRONT_FLAT_RATE_NOTE.md` | Средняя: инвалидация через интерфейс `CDN_INVALIDATOR` (подменяемо); подпись приватных URL жёстко CloudFront | Nginx/Varnish + свои edge-ноды, либо Bunny CDN/Cloudflare CDN перед своим origin (практичнее) | **высокая** (мировой край) / средняя (технически) | Веб-сборка (Flutter) выкладывается в новый origin; приватные документы раздаёт API/Nginx с `secure_link` или короткие presigned MinIO; старый `CLOUDFRONT_*` оставить до смены DNS |
| 15 | WAF (ALB + CloudFront ACL) | Лимит запросов, IP-репутация, «плохие входы» | `infra/modules/alb`, `infra/modules/cdn-waf` | Нет | Только IaC | Cloudflare WAF (платно) либо Nginx + ModSecurity/Coraza + CrowdSec | средняя | Правила: rate-per-ip 2000/5 мин, IP-репутация, Known bad inputs переписать |
| 16 | ACM (сертификаты) | HTTPS-сертификаты для api/admin/web | `infra/modules/stack` | Нет | Только IaC | Let's Encrypt (certbot/Caddy/cert-manager) | низкая | Выпустить новые; перенос не нужен |
| 17 | Route 53 (записи SES, health checks) | DNS-записи почты, проверки доступности. Основной DNS сегодня у Namecheap, планируется Cloudflare | `infra/modules/ses`, `modules/status-page`, `modules/monitoring`; `docs/runbooks/DNS_TO_CLOUDFLARE.md` | Несколько записей | Только IaC | PowerDNS/CoreDNS или оставить Cloudflare/Namecheap DNS | низкая | Экспорт списка записей, TTL снизить заранее |
| 18 | SES (почта: коды, чеки, рассылки; DKIM, MAIL FROM, DMARC, suppression) | Отправка писем | `infra/modules/ses`; код: `apps/api/src/modules/auth/providers/email/ses-email.provider.ts`, `email-provider.factory.ts`; env `EMAIL_PROVIDER`, `SES_REGION`, `SES_FROM_ADDRESS` | Репутация и список подавления | **Адаптер есть** (`mock`/`ses`); добавить класс для нового MTA | Postal или Haraka/Postfix + OpenDKIM + свой ip-warmup; либо внешний Postmark/Resend | средняя (код) / **высокая** (репутация IP, недели прогрева) | DKIM-ключи сгенерировать новые (или перенести); сначала параллельная отправка малой доли; список suppression экспортировать (`sesv2 list-suppressed-destinations`) и импортировать |
| 19 | Rekognition | Автопроверка картинок на запрещённое | `apps/api/src/modules/media-moderation/image-moderation.provider.ts`, integration `aws_rekognition` | Нет (ответы метки) | **Адаптер есть** (интерфейс; комментарий «Google SafeSearch/Hive могут заменить») | NSFW-модель на своём GPU (Falconsai/OpenNSFW2, NudeNet) либо Hive/Google | средняя | Нет данных; очередь модерации продолжается |
| 20 | Macie | Раз в месяц ищет паспорта/карты в документах | `infra/modules/macie` | Отчёты в SNS | Только IaC | Скрипт на Presidio/gitleaks-подобный + cron по MinIO | низкая | Нет данных |

### 1.4 Секреты, ключи, безопасность

| # | AWS сервис | Для чего | Где | Данные | Связность | Свой аналог | Сложность | Перенос без потерь |
|---|---|---|---|---|---|---|---|---|
| 21 | KMS (по ключу на среду: S3, секреты, логи, Redis; отдельный data-key) | Шифрует диск/бакеты и «оборачивает» мастер-ключи чата и админки | `infra/modules/kms`; код: `apps/api/src/common/secrets/kms-env.ts` (`kms:Decrypt` при старте), env `DATA_KEYS_KMS_KEY_ARN`, `MESSAGE_ENC_KEYS`, `SECRETS_MASTER_KEYS`; `docs/runbooks/KEY_ROTATION.md` | Критично: без ключа сообщения нечитаемы | **Жёсткая в формате** (`m2:kms:<ciphertext>`), остальной код читает уже расшифрованные env | HashiCorp Vault (transit) или OpenBao, SOPS+age | **высокая** | Один раз расшифровать каждый обёрнутый ключ в доверенной среде (`kms:Decrypt`), записать в Vault/OpenBao, добавить в `kms-env.ts` ветку `vault:`; шифротекст в БД не менять (те же ключи); ОБЯЗАТЕЛЬНО сделать офлайн-копию ключей до отключения KMS, иначе чат необратимо теряется |
| 22 | Secrets Manager (11+ секретов, ротация Lambda) + SSM Parameter Store (12 параметров) | Пароли БД, JWT, ключи интеграций; переключатели автомасштаба | `infra/modules/secrets`, `modules/secret-rotation` (Lambda `rotator.py`), `modules/db-autoscale`, `redis-autoscale`; код: `common/ops/ssm-param.gateway.ts`, `secret-rotation.service.ts`; `scripts/deploy/prod-secrets.sh`; ECS подставляет секреты как env | Десятки секретов; ключи интеграций ещё и в БД зашифрованы (`SecretsService`) | Жёсткая в ECS-определениях; приложение читает env | Vault/OpenBao + Vault Agent либо SOPS+age и Docker secrets | средняя | Выгрузка через `aws secretsmanager get-secret-value` в защищённой сессии; загрузка в Vault; сверка по SHA-256 значений; ротацию переписать на Vault database engine |
| 23 | IAM (41 роль, OIDC для GitHub, break-glass) | Права контейнеров и CI без долгоживущих ключей | `infra/modules/*` (все), `break-glass`, `org-guardrails`, `.github/workflows/*` (`role-to-assume`, `id-token: write`) | Нет | Жёсткая (в workflows, ops-коде через task role) | Vault + свои сервис-аккаунты; для CI: runner в своей сети или SSH-деплой | средняя | Переписать deploy-workflow на новый способ доступа |
| 24 | GuardDuty, Security Hub, Inspector, Access Analyzer, AWS Config, Org SCP | Обнаружение угроз и контроль настроек | `infra/modules/security-baseline`, `modules/aws-config`, `modules/org-guardrails` | События | Только IaC | Wazuh + Falco + Trivy (уже используется в CI) + OpenSCAP | средняя | Исторические находки экспортировать для аудита |
| 25 | CloudTrail + Athena + Glue (+ audit-logs бакет) | Журнал «кто что делал в AWS» и запросы по нему | `infra/modules/cloudtrail-athena`, `modules/audit-logs` | Логи за период хранения | Только IaC и 5 именованных запросов | Loki или ClickHouse + auditd; хэш-цепочка аудита приложения уже в БД и бакете | средняя | Выгрузить логи за обязательный срок хранения в MinIO (Object Lock) до отключения |

### 1.5 Наблюдаемость и операции

| # | AWS сервис | Для чего | Где | Данные | Связность | Свой аналог | Сложность | Перенос без потерь |
|---|---|---|---|---|---|---|---|---|
| 26 | CloudWatch Logs + Metrics + Alarms (102 тревоги, 37 фильтров метрик, дашборд) + Synthetics (canary) + Container/Insights | Логи, метрики, тревоги по SLO | `infra/modules/monitoring/*`, `infra/observability/grafana` (источник CloudWatch); код: `aws-capacity.service.ts`, `public-status.service.ts`, `secret-rotation.service.ts`, `replica-admin.service.ts` (GetMetricStatistics); workflows `synthetic.yml` | Логи 14-30 дней | Жёсткая: ops-сервисы читают метрики CloudWatch; сам app пишет в stdout | Prometheus + Alertmanager + Grafana + Loki + Blackbox exporter | средняя | Логи не переносят (кроме нужных для аудита); тревоги переписать (102 штуки по списку); админские карточки перевести на Prometheus |
| 27 | SNS (alerts, critical, подписки; PagerDuty) | Рассылка тревог на почту/телефон | `infra/modules/monitoring`; код: `common/ops/launch/aws-launch.service.ts` (Subscribe/Publish) | Подписки | Жёсткая | Alertmanager (webhooks, e-mail), ntfy; PagerDuty остаётся | низкая | Пересоздать маршруты |
| 28 | EventBridge + Scheduler | Расписания, реакция на события ECS/FIS | `infra/modules/*` (13 правил, 6 расписаний) | Нет | Только IaC | cron/systemd timers; расписания приложения уже живут в NestJS `jobs` | низкая | Перечислить правила и повторить |
| 29 | Lambda (5 модулей: db-autoscale, redis-autoscale, endpoints-autoscale, secret-rotation, signing-guard; sweeper loadtest) | Автомасштаб базы/Redis, ротация секретов, проверка подписи образа | `infra/modules/*/lambda/*.py` | Нет | Чистый Python, решения в `decision.py` | Те же скрипты как cron-контейнеры/worker-задачи | низкая | Запускать по расписанию в своей сети; заменить вызовы boto3 на свои API |
| 30 | AWS Budgets, Cost Explorer, Anomaly Detection | Следит за счётом и показывает расходы в админке | `infra/modules/budget`; код: `common/ops/launch/aws-launch.service.ts`, `common/ops/spend/*`, `aws-ops.service.ts` | Нет | Жёсткая (UI «Деньги») | Свой учёт серверов, OpenCost; админская карточка скрывается | низкая | Не нужен после переезда |
| 31 | Fault Injection (FIS) | Учения «что если упадёт зона» | `infra/modules/fis-gameday`, `docs/runbooks/GAMEDAY.md` | Нет | Только IaC | Chaos Mesh / Litmus / Pumba | низкая | Не переносится, только заново |
| 32 | Terraform state (S3 + DynamoDB), CloudFormation (1 stack), bootstrap | Хранение состояния IaC | `infra/bootstrap`, `infra/envs/*/backend.hcl.example` | Состояние | Только IaC | OpenTofu + MinIO backend | низкая | Перед отключением AWS экспортировать `terraform state pull` и tfvars (`lawbid-prod/terraform-tfvars` в Secrets Manager) |
| 33 | Load testing infra (loadgen EC2, sweeper) | Нагрузочные тесты | `infra/modules/loadgen`, `infra/bootstrap-loadtest`, `.github/workflows/load-test*.yml`, `loadtest/` | Нет | Частично (k6 в репо) | k6 на своих серверах | низкая | Переписать workflow |
| 34 | AWS CLI/SDK в CI и скриптах (OIDC, `s3`, `ecs`, `cloudfront`, `secretsmanager`, `logs`) | Деплой, откат, проверка, очистка | `.github/workflows/{deploy,rollback,infra-apply,web-deploy,seo-deploy,terraform-drift,aws-cleanup,aws-inventory,synthetic,self-check}.yml`, `scripts/deploy/*`, `scripts/aws/*`, `scripts/infra/*` | Нет | Жёсткая (~150 вызовов `aws ...`) | Ansible/Nomad/kubectl, `mc`/`rclone` | средняя | Новый pipeline; параллельно оставить старый на период перехода |


## 2. Остальные платные поставщики (не AWS)

| # | Поставщик | Для чего | Где в коде/настройках | Блокирует самохостинг? | Свой аналог / запасной путь | Сложность |
|---|---|---|---|---|---|---|
| 1 | Cloudflare Realtime TURN | Релей для звонков 1 на 1 | `apps/api/src/modules/calls/cloudflare-turn.ts`, env `CLOUDFLARE_TURN_*`, `calls.transport=auto|cloudflare|own`, `docs/runbooks/TURN.md` | Нет: свой путь уже в коде (breaker + `TURN_URLS`) | coturn (модуль `infra/modules/turn`) | низкая |
| 2 | Cloudflare Realtime SFU | Групповые звонки | `modules/calls/cloudflare-sfu.*`, `docs/architecture/GROUP_CALLS_CLOUDFLARE_SFU.md`, `apps/mobile/lib/features/calls/application/cloudflare_sfu_call_media.dart` | Нет, но клиент привязан к его API; запасной путь: mesh до 2-4 | LiveKit (`infra/modules/livekit`, спящий код `livekit.provider.ts`) | средняя |
| 3 | Cloudflare R2 (публичные фото, по умолчанию выключено) | Дешёвая раздача аватаров/фото | `media.public_store`, env `CLOUDFLARE_R2_*`, `scripts/ops/verify-r2-media.sh`, `apps/api/scripts/migrate-public-media-to-r2.ts` | Нет | MinIO; маршрутизация по имени бакета в `File` позволяет смешивать | низкая |
| 4 | Cloudflare Turnstile | Защита форм от ботов | env `TURNSTILE_*`, `apps/mobile/lib/core/security/turnstile*.dart` | Нет (можно отключить), но зависит от Cloudflare | hCaptcha-like/Altcha/mCaptcha (самохост) | низкая |
| 5 | Cloudflare Analytics API / DNS (план) | Метрики расхода; перенос DNS с Namecheap | env `CLOUDFLARE_ANALYTICS_*`, `docs/runbooks/DNS_TO_CLOUDFLARE.md` | Нет | PowerDNS | низкая |
| 6 | Bunny Stream | Видео и рилсы: загрузка, перекодирование, подписанное воспроизведение, статистика | `apps/api/src/modules/videos/` (`bunny-stream.client.ts`, `bunny-signing.ts`), env `BUNNY_*`, интеграция `bunny_stream` | **Да, пока нет замены в коде** (запасного пути нет) | Свой пайплайн: tusd + FFmpeg + HLS на MinIO + Nginx/Bunny CDN; или Cloudflare Stream/Mux | **высокая** |
| 7 | Twilio | SMS-коды входа | `modules/auth/providers/sms/twilio-sms.provider.ts`, `SMS_PROVIDER`, `TWILIO_*` | Нет: интерфейс `sms-provider.interface.ts` есть | Любой SMS-шлюз; полностью свой SMS без оператора невозможен | низкая |
| 8 | Stripe (подписки, Tax, Connect-выплаты, вебхуки) | Деньги | `modules/billing/`, `modules/stripe-ops`, `modules/treasury`, `STRIPE_*`, `flutter_stripe` | **Да** (платёжный процессор, второго нет) | Интерфейс `PaymentProvider` есть; свой процессор невозможен, нужен другой эквайер | высокая |
| 9 | Firebase Cloud Messaging | Push Android/web | `modules/notifications/push/fcm-push.sender.ts`, `FCM_*`, `firebase_messaging` | **Да** (платформенный канал) | UnifiedPush (Android без Google, но не для массовых) | высокая (нет замены) |
| 10 | Apple APNs (push + VoIP/CallKit) | Push iOS и звонки | `push/apns-voip.sender.ts`, `APNS_*` | **Да** | Нет | высокая (нет замены) |
| 11 | Firebase App Check / Firebase Core | Подтверждение, что запрос от настоящего приложения | `firebase_app_check`, `docs/runbooks/APP_CHECK.md` | Частично (на Android Play Integrity) | Self-hosted attestation невозможна | средняя |
| 12 | Sentry | Ошибки и краши | `SENTRY_DSN`, `apps/api/src/telemetry/sentry.ts`, `sentry_flutter` | Нет | GlitchTip или самохост Sentry (Sentry-совместим) | низкая |
| 13 | PagerDuty | Звонки дежурному | Terraform `pagerduty_https_endpoint`, `aws-launch.service.ts` | Нет | Alertmanager + свой шлюз, ntfy, Grafana OnCall (архив) | низкая |
| 14 | Persona (проверка личности) | KYC адвокатов | интеграция `persona`, `ID_VERIFICATION_PROVIDER` | Нет (переключатель, ручная проверка в админке) | Ручной процесс | низкая |
| 15 | Google Translate API | Машинный перевод | `modules/translation`, `GOOGLE_TRANSLATE_API_KEY` | Нет | LibreTranslate/Argos/NLLB на своём GPU | средняя |
| 16 | OpenAI Moderation API | Модерация текста | `OPENAI_MODERATION_API_KEY` | Нет | Detoxify/Llama Guard на своём GPU | средняя |
| 17 | PhotoDNA, NCMEC | Детская безопасность (юридическая обязанность) | интеграции `photodna`, `ncmec` | **Да** (закрытые базы, обязательны по закону) | Нет замены | высокая |
| 18 | Google/Apple Sign-In, Google/Microsoft Calendar OAuth | Вход и календарь | `GOOGLE_CLIENT_IDS`, `APPLE_*`, `GOOGLE_CALENDAR_*`, `MS_CALENDAR_*` | Нет, но это внешние ID-провайдеры | Остаётся (только OAuth-клиент) | низкая |
| 19 | Apple Developer Program, Google Play | Магазины и подпись приложений | `.github/workflows/mobile-release.yml`, `apps/mobile/fastlane` | **Да** | Нет (веб-версия — запасной экран) | высокая (нет замены) |
| 20 | GitHub (код, Actions, Dependabot, CodeQL, Sigstore keyless) | Репозиторий и CI | `.github/workflows/*` (26 файлов) | Нет, но 26 workflows GitHub-специфичны | Forgejo/Gitea + Woodpecker/Drone; cosign с ключами | средняя |
| 21 | Namecheap | Регистратор домена `lawbid.dev` | `docs/runbooks/DNS_TO_CLOUDFLARE.md` | Нет (трансфер стандартный) | Любой регистратор | низкая |
| 22 | ClamAV (самохост, зеркало баз `mirror-clamav.yml`) | Антивирус загрузок | `CLAMAV_HOST/PORT`, `virus-scanner.ts`, sidecar в ECS | Нет (уже своё) | Уже открытый код | низкая |
| 23 | Grafana (дашборды на данных CloudWatch) | Графики | `infra/observability/grafana` | Нет | Grafana + Prometheus (самохост) | низкая |
| 24 | Docker Hub / GHCR / npm / pub.dev / CocoaPods | Базовые образы и зависимости при сборке | `Dockerfile`, `package-lock.json`, `pubspec.lock` | Нет | Свои зеркала (Harbor proxy-cache, Verdaccio) | низкая |

Итого вне AWS: 24 позиции; жёстко блокируют полный самохостинг 7 (Bunny пока, Stripe, FCM, APNs, PhotoDNA/NCMEC, Apple/Google магазины), но ни одна не мешает переезду вычислений и данных.

## 3. Прямые обращения клиентов к облакам

- `apps/mobile`: ходит на `https://api.lawbid.dev` и `https://media.lawbid.dev` (свои домены). Жёсткого `*.amazonaws.com` и `*.cloudfront.net` в рабочем коде нет (находится только в тестовых/справочных строках). Значит, перенос меняет DNS, а не приложение, если домены сохранятся.
- `apps/admin`: только `api.lawbid.dev`; хостится как контейнер на ECS.
- Веб-версия Flutter: статика S3 + CloudFront; уникальные хэшированные имена.
- Все публичные имена (`api`, `admin`, `media`, `status`, корень) — домены `lawbid.dev`; это главный рычаг безболезненного переключения.

## 4. Порядок переезда без потерь (рекомендуемый)

1. **Измерить** объёмы и сделать офлайн-копии ключей (KMS-обёрнутые, секреты, tfvars, state).
2. **Postgres**: поднять Patroni + pgBackRest у себя, включить логическую репликацию с RDS; сверка таблиц; нагрузочный тест; окно переключения не более нескольких минут.
3. **Файлы**: MinIO, `mc mirror` документов и медиа с хэш-проверкой; затем непрерывная дельта; переключить `S3_ENDPOINT`.
4. **Ключи**: Vault/OpenBao, добавить ветку `vault:` в `kms-env.ts`.
5. **Контейнеры**: параллельно запустить api/worker/admin/pgbouncer/clamav; Redis/Valkey Sentinel.
6. **Edge**: Bunny/Cloudflare CDN перед своим origin, Nginx/HAProxy, WAF, ACME.
7. **Почта**: параллельная отправка через Postal, прогрев.
8. **Наблюдаемость**: Prometheus/Loki/Grafana/Alertmanager; перевести карточки админки.
9. **DNS** на новые адреса (TTL 60 с заранее), неделя наблюдения, AWS в режиме «только чтение», затем выключение.

## 5. Как измерить объёмы (запустить владельцу/ассистенту при подготовке)

- База: `psql -c "select pg_size_pretty(pg_database_size(current_database()))"` и топ таблиц по `pg_total_relation_size`.
- S3: `aws s3 ls s3://<bucket> --recursive --summarize` либо CloudWatch `BucketSizeBytes` для documents/media/web/audit.
- Redis: `INFO memory` (очереди BullMQ).
- Секреты: `scripts/deploy/prod-secrets.sh` (список), `aws secretsmanager list-secrets`.
- CloudWatch Logs: `aws logs describe-log-groups --query 'logGroups[].[logGroupName,storedBytes]'`.
- Расходы по сервисам за месяц: `aws ce get-cost-and-usage --group-by Type=DIMENSION,Key=SERVICE` (определит, что переносить первым).

## 6. Сводка

| Показатель | Значение |
|---|---|
| Позиций AWS | 34 |
| Лёгких / средних / тяжёлых (AWS) | 16 / 12 / 6 |
| Позиций других платных поставщиков | 24 |
| Блокируют полный самохостинг | 7 (Stripe, FCM, APNs, PhotoDNA/NCMEC, магазины Apple/Google, Bunny пока) |
| Готовность данных и приложения | ~65 % |
| Готовность IaC | ~0 % |
| Готовность операционного кода | ~20 % |
| **Общая готовность** | **~40 %** |
