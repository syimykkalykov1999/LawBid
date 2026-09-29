# api-unhealthy-hosts — tasks failing `/health/ready`

`/health/ready` is 503 when the database or Redis is unreachable
(security-hardening e2e); `/health/live` stays 200. The ALB stops routing
to the task; ECS replaces tasks that fail the container health check.

**Check.** ECS service events (task stopped reasons), task logs
(`/lawbid/<env>/api`), then [db-redis-unavailable.md](db-redis-unavailable.md).
If only new tasks are unhealthy after a deploy: bad image/env — the
circuit breaker rolls back; confirm in the service deployments tab.

**Act.** Fix the dependency or roll back; do not raise the health-check
thresholds to silence the alarm.
