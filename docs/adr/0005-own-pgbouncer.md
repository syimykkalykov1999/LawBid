---
status: "accepted"
date: 2026-10-24
decision-makers: owner
---

# Own PgBouncer pool, no RDS Proxy

## Context and problem statement

A small RDS accepts about 99 connections. 70 to 140 API and worker copies, each
with its own pool, need hundreds. The Terraform check `db_connection_budget` fails for this reason.

## Decision drivers

- Owner rule 2026-10-24: no paid middlemen (RDS Proxy).
- Database sees a small fixed number of connections whatever the number of tasks.
- Same approach Instagram used.

## Considered options

- Own PgBouncer on ECS, transaction mode, found via Cloud Map private DNS (chosen)
- RDS Proxy
- Bigger database instance only

## Decision outcome

2 PgBouncer tasks in two zones (a third under CPU load), up to 5000 client
connections each, 69 of 99 server connections reserved for them, 30 left for
migrations and admin. Off by default behind a switch; the app reads
`DB_POOLER_HOST`. Migrations and one-off tasks go straight to RDS.

### Consequences

- Good: no per-hour Proxy fee; connection count independent of task count.
- Bad: we own an image (`infra/pgbouncer`, `build-pgbouncer.yml`) and its patching; transaction mode forbids session features (advisory locks across statements, LISTEN).
- Confirmation: `pooler-url.spec.ts`, `pool-defaults.spec.ts`, the Terraform connection-budget check.

## More information

[DB_POOLER.md](../architecture/DB_POOLER.md), [runbook](../runbooks/DB_POOLER.md). Back-filled 2026-10-25.
