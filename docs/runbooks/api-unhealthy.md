# api-unhealthy-hosts — tasks failing `/health/ready`

> **Для владельца:** Ничего не делать: AWS заменяет такой сервер сам за пару минут. Все письма и кнопки: [OWNER.md](OWNER.md).

`/health/ready` is 503 when the database or Redis is unreachable
(security-hardening e2e); `/health/live` stays 200. The ALB stops routing
to the task; ECS replaces tasks that fail the container health check.

**Check.** ECS service events (task stopped reasons), task logs
(`/lawbid/<env>/api`), then [db-redis-unavailable.md](db-redis-unavailable.md).
If only new tasks are unhealthy after a deploy: bad image/env — the
circuit breaker rolls back; confirm in the service deployments tab.

**Act.** Fix the dependency or roll back; do not raise the health-check
thresholds to silence the alarm.

**A task cut off from the database (perf batch 2, 13.11).** `/health/live`
never looks at the database (Kubernetes liveness guidance: a shared
dependency in liveness restarts every replica at once), so a task that
lost only its own database connection used to keep running for ~50 min
(11.11, 13.11). `DbLostWatchdog` (apps/api/src/modules/health) asks the
database every 30 s; after `ops.db_lost_exit_min` minutes (admin, default
10, 0 = never) without an answer it restarts the task (SIGTERM, ECS starts
a new one) ONLY when another task reached the database in the last 90 s,
at most one task per 10 minutes for the whole fleet, after a random
0..`ops.db_lost_exit_jitter_sec` wait. A database-wide outage, or Redis
gone too, restarts nothing. Log line: `alert=api_task_db_lost_exit`.
