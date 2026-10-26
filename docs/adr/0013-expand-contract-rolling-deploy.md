---
status: "accepted"
date: 2026-10-05
decision-makers: owner
---

# Expand/contract migrations, rolling deploy, alarm-based rollback

## Context and problem statement

During a rolling deploy two releases run at once, and rollback must always meet a
schema the old release can read. We want "zero maintenance": no manual rollbacks.

## Decision drivers

- One-person operations; deploys must be safe by construction.
- Blue/green needs Terraform provider 6.x, a second target group and double cost.

## Considered options

- Rolling ECS deploy plus circuit breaker plus CloudWatch-alarm rollback; expand/contract-only migrations (chosen)
- ECS built-in blue/green or CodeDeploy canary (later)
- Maintenance windows

## Decision outcome

`scripts/check-migrations.mjs` rejects (after the baseline) dropping or renaming a
table or column, changing a type, or adding NOT NULL without DEFAULT, unless the file
carries `-- migration-safety: contract <why>`. Migrations run as a separate one-off task
before the services roll. ECS watches the 5xx, p95 and unhealthy-host alarms during the
rollout and rolls back by itself; `rollback.yml` is the one-button manual rollback.

### Consequences

- Good: old release always works on the new schema; rollback needs no migration.
- Bad: a rename takes three releases (add, copy, drop). Blue/green is deferred.
- Confirmation: the CI steps "Migrations are expand/contract only" and "Migrations apply on the previous release's database".

## More information

[DEPLOY_SAFETY.md](../runbooks/DEPLOY_SAFETY.md), `.github/workflows/deploy.yml`, `rollback.yml`. Back-filled 2026-10-25.
