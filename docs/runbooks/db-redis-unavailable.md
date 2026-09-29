# Database / Redis unavailable

`/health/ready` returns 503 (readiness probes DB and Redis); the ALB drains
tasks (api-unhealthy-hosts), the worker logs connection errors.

**Check.**
1. CockroachDB Cloud Console: cluster status, node health, connection
   limits; Cockroach status page.
2. ElastiCache events: failover in progress (30–60 s of errors is expected
   during an automatic failover).
3. Networking: NAT gateways, VPC endpoints, security groups unchanged?
   (Terraform plan should be empty.)

**Act.** Wait out a failover; for a Cockroach outage follow their status
and keep the app up (reads fail fast, writes retry). If credentials were
rotated, update the Secrets Manager values and force a new deployment so
tasks pick them up. RTO target 4 h — if the cluster is lost, start
[backups.md](backups.md) → restore.
