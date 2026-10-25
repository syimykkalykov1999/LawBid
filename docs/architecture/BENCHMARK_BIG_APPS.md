# LawBid vs big products: benchmark (2026-10-24)

Method: practices of Telegram, WhatsApp, Instagram, Discord, Slack, Notion, Figma, Uber, Shopify, Stripe, Cloudflare (from their engineering blogs and talks, recalled from memory, not re-fetched today; `SHARDING_READY.md` already cites Instagram/Notion/Figma/Slack sharding) compared with `origin/main` by grep. Evidence is `file:line` on origin/main. Effort is in agent hours (ah).

## Резюме для владельца (по-русски)

Хорошая новость: LawBid уже сделан почти как у больших. Есть лимиты расходов (бюджет AWS, дневные лимиты SMS), автоподъём и автоспуск (ECS 1-50, база, Redis), дешёвый Spot и Graviton по переключателю, защита от лавины запросов (сброс нагрузки, автомат-выключатель, single-flight), бэкапы с учебным восстановлением, шифрование ключами KMS, журнал аудита, защита от повторного входа по украденному токену, TOTP для админов, GuardDuty.

Чего нет, и о чём лучше знать заранее:
1. Нет настоящего «пилота»: новая версия выкатывается всем сразу (с автооткатом, но без 5% пробного трафика).
2. Нет репетиции аварий (выключить Redis, уронить базу и посмотреть, что будет). Первая настоящая авария станет и первой репетицией.
3. Нет сквозного шифрования переписки (как в WhatsApp). Для юридической тайны это решение владельца: сейчас сообщения шифрует сервер, ключи у нас. Это честнее объяснить юристам, чем скрывать.
4. Нет проверки «инфраструктура не изменилась тайком» (drift) и нет дежурного телефона (PagerDuty): тревоги идут на почту и в Slack, ночью их можно не заметить.
5. Нет вертикального деления данных по регионам (второй регион для работы, не только для копий).
6. Защита от ботов AWS стоит денег и пока лишь считает, не блокирует.

Что может прийти завтра: «сайт лежит, а мы не знали» (тревога ночью), «выкатили плохую версию на всех», «счёт за SMS-фрод». Первое и второе закрываются за часы работы готовыми инструментами. Всё остальное делаем по сигналам роста (таблица в конце).

## 1. Cost controls

| Practice (who) | Status | Evidence | If PARTIAL/MISSING: option, tool, effort, risk |
|---|---|---|---|
| Budgets + anomaly detection (all AWS shops) | HAVE | `infra/modules/budget`, `infra/README.md:26`, `prod/main.tf:99` | |
| Per-feature money caps (Stripe/Twilio-style spend limits) | HAVE | `env.schema.ts:501` `BUDGET_SMS_DAILY_MAX`, `:584` cents cap; `admin-budgets.service.ts`; runbook `sms-spend.md` | |
| Abuse/fraud limits on signup/OTP | HAVE | OTP daily limit `auth.service.otp-daily-limit.spec.ts`, `OTP_LOCKOUT_SECONDS env.schema.ts:152`, WAF rate rules `alb/main.tf:278,301` | |
| Egress control (Cloudflare R2 zero egress; Discord/Slack CDN) | PARTIAL | R2 designed `R2_PUBLIC_MEDIA.md:4`; Bunny video; private files stay S3 | Finish R2 cutover, then S3 gateway/VPC endpoints are already in network module. 4-6 ah. Risk: surprise CloudFront/NAT bill when media grows. |
| Spot + ARM (Uber/Shopify use spot heavily) | HAVE (off by default) | Fargate Spot flags `ecs/main.tf:113,118`; ARM64 switch `variables.tf:354`, `ecs/main.tf:95` | Flip ARM after multi-arch deploy; 1 ah. |
| Autoscale guardrails (max, cooldown, circuit breaker) | HAVE | `ecs/main.tf:616` max, `:673` scale_in_cooldown 600, `:533` deployment circuit breaker; DB/Redis autoscalers | |
| Per-user storage/upload quota | MISSING | grep found no quota on upload bytes | Add per-account byte quota + daily upload cap (own code, small). 4 ah. Risk: one abusive user fills R2/S3. |
| Tiered storage / lifecycle (Slack, Instagram cold tiers) | PARTIAL | lifecycle on documents bucket `s3/main.tf:132` (exports 3 d, old versions); no Intelligent-Tiering/Glacier for old legal files | Add S3 Intelligent-Tiering after 90 d for documents (no retrieval fee). 2 ah. Risk: low now, grows with data. |
| Cost per tenant / unit-economics dashboard | PARTIAL | `docs/perf/cost-plan-2026-10-20.md`, `runbooks/cost.md` | Cost allocation tags + AWS Cost Explorer saved report. 2 ah. |

## 2. Caching

| Practice | Status | Evidence | Gap |
|---|---|---|---|
| Client local DB + delta sync (Telegram: updates by pts/seq) | PARTIAL | Mobile has drift/SQLite only for L10n `pubspec.yaml:57`; HTTP cache with SWR `core/cache/http_cache_interceptor.dart:9`; cursor pages `api-response.dto.ts:26`; no "changes since" API | Best option for our stage: keep HTTP SWR + ETag now; add `updatedSince` delta endpoints for chats and cases only when feed loads slow. 16-24 ah. Risk: chat history reloads over mobile data, battery. Reuse: drift (MIT, already in). |
| HTTP revalidation (ETag) | HAVE | `app.setup.ts:134`, `app.module.ts:423` | |
| CDN/edge | HAVE | CloudFront + WAF `cdn-waf/main.tf`, R2 public, Bunny | |
| TTL + jitter + invalidation | HAVE | `common/cache/single-flight.ts` `jitterTtl` (spec `single-flight.spec.ts:43`) | |
| Request coalescing / stampede (Discord data services, Facebook leases) | HAVE | `singleFlight` (`single-flight.spec.ts:12`, 500 callers one load); admin summary SWR `admin-summary.service.ts:31` | |
| Read replicas | PARTIAL | Code ready: `prisma-read.service.ts`, flips on `DATABASE_REPLICA_URL` (`prisma-read.service.spec.ts:13`); no replica resource in `infra/modules/postgres` | Add `aws_db_instance` replica behind a variable, route search and lists. 4 ah. Risk: DB CPU at read-heavy growth. Signal below. |
| Hot-key protection | PARTIAL | jitter only; no local in-process L1 for hottest keys | Small L1 (LRU, 1-5 s) for settings and flags. 3 ah. |

## 3. Security of sensitive data

| Practice | Status | Evidence | Gap |
|---|---|---|---|
| Encryption at rest, customer-managed keys | HAVE | `kms/main.tf:36` rotation on; documents SSE-KMS versioned `s3/main.tf:70` | |
| Envelope/app-level encryption, key rotation | HAVE | `kms-env.spec.ts:25` `MESSAGE_ENC_KEYS`, `SECRETS_MASTER_KEYS`, `DATA_KEYS_KMS_KEY_ARN` (multi-key list = rotation) | Rotation drill not logged: 2 ah. |
| True end-to-end (WhatsApp/Signal protocol) | MISSING | no E2E found in chat module; server holds keys | Owner decision. Option: E2E only for chat via Signal protocol `libsignal` (AGPL-3.0, mature) costs 80+ ah and kills server search/moderation; instead keep server-side encryption and say so in the privacy text. Risk: marketing claim "end-to-end" would be false. |
| Audit logs, immutable | HAVE | `AuditLog` `schema.prisma:3568`; `audit-logs` module with Object Lock option `prod/main.tf:138`; CloudTrail | Confirm Object Lock is ON in prod (`variables.tf:433` default). 1 ah. |
| Least privilege, four-eyes admin | HAVE | admin approvals `admin-approvals.controller.ts`, admin TOTP `admin-auth.controller.ts:64` | |
| Secrets management | HAVE | `modules/secrets`, `secrets.service.ts`, gitleaks `secret-scan.yml` | |
| Device trust / attestation | PARTIAL | Firebase App Check in monitor/enforce `app-check.service.ts:49`; default mode not enforce | Move to enforce after a week of clean monitor data. 2 ah. Risk: scripted signups. |
| Rate limiting | HAVE | `app.module.ts:244` ThrottlerModule + WAF rate `alb/main.tf:278` | |
| Bot protection | PARTIAL | AWS Bot Control exists but off/count `alb/main.tf:33,334` | Cheaper: Cloudflare Turnstile (free) on signup/OTP/login web forms; for mobile rely on App Check. 4 ah. Risk: SMS pumping fraud. |
| Account takeover | HAVE | refresh reuse detection `auth.service.ts:839`, passkeys `runbooks/PASSKEYS.md`, new-device signal `sessions-cleanup.job.ts:8`, OTP lockout | Credential-stuffing/impossible-travel scoring absent: low priority. |
| Malware scan, data classification | HAVE | ClamAV `env.schema.ts:630`, Macie module | |
| Backups + restore drills | HAVE | AWS Backup + Vault Lock `backup/main.tf:59`, PITR, cross-region S3 replication, `restore-drill.md`, `self-check.yml` | Log at least one drill before release. 1 ah. |
| Incident response | PARTIAL | `runbooks/BREACH.md`, `SECURITY_LEGAL.md` | No tabletop exercise or on-call rota. 3 ah. |
| Supply chain (SBOM/signing, SAST) | PARTIAL | CodeQL `codeql.yml`, Trivy `container-scan.yml`, gitleaks, dependabot | Image signing (cosign, Apache-2.0) + SBOM in deploy. 3 ah. |

## 4. Scaling up and down smoothly

| Practice | Status | Evidence | Gap |
|---|---|---|---|
| Queue-based load leveling (BullMQ) + queue-depth scaling | HAVE | `ecs/main.tf:154`, `ops-metrics.job.ts` queue_waiting_total, DLQ `billing.constants` | |
| Backpressure / load shedding | HAVE | `LoadSheddingMiddleware` `app.module.ts:420` (503 + Retry-After) | |
| Circuit breakers | HAVE | `common/resilience` `CircuitBreaker` (bunny, fcm) | Check every vendor (Twilio, SES, Stripe) is wrapped: 2 ah. |
| Retries with jitter, server-controlled | HAVE | client tuning `client-tuning.ts:27,41` (Retry-After cap, retry count from server) | |
| Connection pooling | HAVE | own PgBouncer `infra/modules/pgbouncer`, `DB_POOLER.md`; `statement_timeout` set `postgres-search.provider.ts:563` | |
| Sharding / cells | PARTIAL | shard column + design `SHARDING_READY.md`, `audit_log_created_at_idx (created_shard)` | Ready by design; nothing to run now. |
| Websockets at scale | HAVE | Socket.IO Redis adapter + recovery log `realtime-event-log.ts:60` | Load test beyond ~50k connections is untested: signal below. |
| Multi-region readiness | PARTIAL | cross-region copies only (backup, S3) | Active-passive warm region design doc: 6 ah when needed. |
| Graceful degradation switches | HAVE | AppSettings and feature flags `FeatureFlagsModule app.module.ts:252` | |
| Partitioning/archival of big tables | MISSING | no PARTITION BY (only baseline `archived` enums) | pg_partman (PostgreSQL license, mature) for audit log, notifications, messages when each passes ~50M rows. 6 ah. |

## 5. Speed and smoothness

| Practice | Status | Evidence | Gap |
|---|---|---|---|
| p95/p99 budgets | PARTIAL | `docs/perf/*`, load tests `loadtest/`, `load-nightly.yml`, SLO alarms `monitoring/slo.tf` | Per-endpoint p95 budget as a CI gate (k6 thresholds): 3 ah. |
| Image optimization | HAVE | `sharp` `package.json:90`; media on R2/CDN | Confirm AVIF/WebP and ThumbHash placeholders: 2 ah. |
| Video | HAVE | Bunny, `perf/VIDEO_START_2026-10-23.md` | |
| Pagination | HAVE | cursor envelope `api-response.dto.ts:26` | |
| Prefetch | PARTIAL | media cache dir `media_cache_dir.dart`; no feed prefetch policy | Part of client-delta item. |
| Push fan-out | PARTIAL | FCM breaker; fan-out is per-job | Batched FCM multicast + collapse keys: 3 ah. Risk: push storms on a viral event. |

## 6. Reliability

| Practice | Status | Evidence | Gap |
|---|---|---|---|
| SLOs + multiwindow burn-rate (Google SRE) | HAVE | `monitoring/slo.tf:1-8`, `runbooks/slo.md` | |
| Actionable alerts, one runbook per alarm | HAVE | `runbooks/README.md:8`, 25+ runbooks | |
| Paging (phone, escalation) | MISSING | SNS to email + Slack webhook only `monitoring/main.tf:1,48` | Grafana OnCall OSS / PagerDuty free tier / Better Stack. AWS Chatbot is free. 2 ah. Risk: night outage unseen for hours. |
| Chaos / failover tests | MISSING | only a note to test `reboot-db-instance --force-failover` `DB_POOLER.md:260` | Scheduled GameDay: AWS FIS (pay per action, cents) kills a task, fails over RDS, stops Redis. 6 ah then quarterly. |
| Deploy safety: canary / blue-green | PARTIAL | rolling 100/200 + circuit breaker `ecs/main.tf:531-533`, staging, smoke, approval `deploy.yml:1-3`, `rollback.yml` | No traffic-weighted canary. ECS native blue/green (2025) or CodeDeploy with ALB weights. 6 ah. Risk: a bad release hits 100% before alarm. |
| Feature flags + kill switches | HAVE | `FeatureFlagsModule`, AppSettings, app-version gate | Flag provider is own; OK (Unleash or GrowthBook only if needed). |
| Infra drift detection | MISSING | no scheduled `terraform plan` in workflows | Nightly `plan -detailed-exitcode` to Slack; or Spacelift/Atlantis later. 3 ah. |
| Tracing | HAVE | OTel + Sentry `package.json:56,62` | |
| Uptime canary | HAVE | `.canary-*.zip`, `slo.tf` | |

## Prioritized list

### Do before release
1. Paging to phone (Chatbot + PagerDuty/Better Stack free) - 2 ah. Prevents unseen night outage.
2. Log one full restore drill + one RDS failover test in staging - 3 ah. Prevents "backup does not restore".
3. Confirm prod flags: audit-log Object Lock, Vault Lock, KMS rotation, WAF rate rules - 2 ah.
4. Turnstile on signup/OTP web forms; App Check to enforce after monitor review - 5 ah. Stops SMS pumping bill.
5. Per-user upload byte quota + daily cap - 4 ah.
6. Wrap Twilio/SES/Stripe in circuit breakers if not yet - 2 ah.
7. Owner decision on E2E claim: write the privacy text honestly (server-side encryption, keys in KMS) - 1 ah.

### Right after release (first month)
8. ECS blue/green or canary with alarm rollback - 6 ah.
9. Nightly Terraform drift check - 3 ah.
10. First GameDay with AWS FIS (task kill, Redis stop, DB failover) - 6 ah.
11. Image signing + SBOM (cosign, syft; Apache-2.0) - 3 ah.
12. Intelligent-Tiering for documents; cost-allocation tags - 4 ah.
13. k6 p95 gates in nightly load test - 3 ah.
14. Batched push with collapse keys - 3 ah.
15. Flip ARM64 and Spot for extra tasks once the multi-arch image exists - 1 ah (saves ~20-30% Fargate).

### At growth signal
- Read replica (`aws_db_instance`, code already routes): primary CPU > 60% for a day, or p95 of list endpoints > 400 ms. 4 ah.
- Client delta sync (`updatedSince`, drift tables): chat open p95 > 1.5 s or > 30% of traffic is repeat list fetches. 20 ah.
- Table partitioning (pg_partman): any table > 50M rows. 6 ah.
- Warm second region: contract demands RTO < 1 h, or > 100k DAU. 6 ah design + 20 ah build.
- Logical shards / cells: DB at the top tier (`SHARDING_READY.md`) and writes bound. Large.
- AWS Bot Control block mode: Turnstile + App Check still leak (> 1% fake signups). Paid.
- True E2E chat: only if a customer contract or competitor requires it. 80+ ah.
- WebSocket scale test: connected sockets > 20k.

## Top 15 (priority / effort)
P0: paging 2; restore + failover drill 3; prod security flag audit 2; Turnstile + App Check enforce 5; upload quota 4; vendor circuit breakers 2; honest E2E wording 1.
P1: blue/green 6; drift check 3; GameDay 6; image signing 3; tiering + tags 4; k6 gates 3; push batching 3; ARM/Spot flip 1.
