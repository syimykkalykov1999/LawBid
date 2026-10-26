# Database / Redis unavailable

> **Для владельца:** Приложение переподключится само. Откройте консоль провайдера базы PostgreSQL: авария там чинится провайдером. Все письма и кнопки: [OWNER.md](OWNER.md).

`/health/ready` returns 503 (readiness probes DB and Redis); the ALB drains
tasks (api-unhealthy-hosts), the worker logs connection errors.

**Check.**
1. Managed PostgreSQL provider console: instance status, failover
   events, storage, connections vs `max_connections` (and the pooler —
   PgBouncer / RDS Proxy — if one is used); the provider's status page.
2. ElastiCache events: failover in progress (30–60 s of errors is expected
   during an automatic failover).
3. Networking: NAT gateways, VPC endpoints, security groups unchanged?
   (Terraform plan should be empty.)

**Act.** Wait out a failover; for a provider outage follow their status
and keep the app up (reads fail fast, writes retry). If credentials were
rotated, update the Secrets Manager values and force a new deployment so
tasks pick them up. RTO target 4 h — if the database instance is lost, start
[backups.md](backups.md) → restore.
