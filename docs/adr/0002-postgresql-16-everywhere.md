---
status: "accepted"
date: 2026-10-14
decision-makers: owner
---

# PostgreSQL 16 for development, CI and production

## Context and problem statement

The first specs assumed CockroachDB. Development, CI and production used
different engines or settings, and managed Cockroach adds a vendor. Which
database do we run?

## Decision drivers

- Same engine everywhere, so CI proves what production does.
- Managed, cheap start, can grow on AWS where the rest lives.
- Mature tooling (PgBouncer, PITR backups, AWS Backup, extensions).

## Considered options

- PostgreSQL 16 on RDS, plain `postgres:16` in Docker (chosen)
- CockroachDB (self-hosted or cloud)
- Aurora PostgreSQL

## Decision outcome

PostgreSQL 16 everywhere. The baseline migration is `20261014100000_postgres_baseline`
(the migration safety check starts after it).

### Consequences

- Good: one engine; `docker-compose.yml` and CI use the same major version.
- Bad: no built-in horizontal scale, so we prepared sharding at app level
  (ADR-0003). Some old comments, `apps/api/.env.example` and `.env.test` still show a
  Cockroach-style URL (port 26257); use the local Postgres URL from `docs/ONBOARDING.md`.
- Confirmation: `api-ci.yml` runs against a Postgres 16 service.

## More information

`docker-compose.yml` header comment (owner 2026-10-14); `docs/02_DATABASE.md`.
Back-filled 2026-10-25.
