# Runbooks (docs/06 §8)

**Владельцу: начните с [OWNER.md](OWNER.md)** — какое письмо что значит и
что делать, простыми словами. Первый запуск на AWS — [PROD_LAUNCH.md](PROD_LAUNCH.md); выкладка новых версий на уже работающий прод — [DEPLOY_PROD.md](DEPLOY_PROD.md).
Всё остальное ниже — для инженера.

One page per alert of `infra/modules/monitoring` (the alarm description
names its runbook). Every page follows the same shape: **Signal → Check →
Act → Escalate → After**. Dashboards: `infra/observability/grafana`.
On-call: the owner until a rotation exists (docs/06 §11.1 "дежурный
назначен").

| Alarm | Runbook |
|---|---|
| `api-5xx-ratio` (5xx > 1 % / 5 min) | [api-5xx.md](api-5xx.md) |
| `api-p95` (p95 above target 10 min) | [api-latency.md](api-latency.md) |
| `api-unhealthy-hosts` | [api-unhealthy.md](api-unhealthy.md) |
| `queue-backlog` (oldest job > 5 min) | [queues.md](queues.md) |
| `tx-retries` (40001 spike) | [db-contention.md](db-contention.md) |
| `stripe-webhooks` (DLQ) | [stripe-webhooks.md](stripe-webhooks.md) |
| `payments-failed` (spike) | [payments-failed.md](payments-failed.md) |
| `journal-integrity` (CRITICAL) | [journal-integrity.md](journal-integrity.md) |
| `sms-spend` | [sms-spend.md](sms-spend.md) |
| `redis-cpu` / `redis-memory` | [redis.md](redis.md) |
| `api-cpu` / `worker-cpu` | [ecs-capacity.md](ecs-capacity.md) |
| Backup failed (database host alert) | [backup-failed.md](backup-failed.md) |
| DB / Redis unavailable (`/health/ready` 503), `db-down` | [db-redis-unavailable.md](db-redis-unavailable.md) |
| `db-slow` (DB probe > 1 s) | [db-contention.md](db-contention.md) |
| `aws-budget-reached`, AWS Budgets / Cost Anomaly e-mails | [cost.md](cost.md) |
| `backup-stale` (newest database backup too old) | [backup-failed.md](backup-failed.md) |
| `ses-bounce-rate` / `ses-complaint-rate` | [ses.md](ses.md) |
| `api-no-running-tasks` / `worker-no-running-tasks` | [ecs-capacity.md](ecs-capacity.md) |
| GitHub «Self-check (production)» failed | the run summary + [OWNER.md](OWNER.md) |

Backups and restore: [backups.md](backups.md), quarterly drill log:
[restore-drill.md](restore-drill.md). Before launch, wiping the beta test
data: [prelaunch-wipe.md](prelaunch-wipe.md).
