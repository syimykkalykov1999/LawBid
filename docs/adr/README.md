# Architecture Decision Records (ADR)

## Резюме для владельца (по-русски)

Здесь записано, **почему** система устроена именно так: одна короткая страница
на каждое важное решение (что было, что выбрали, чем это грозит). Нужно, чтобы
новый человек или другой Claude не переспрашивал то, что вы уже решили, и не
«улучшал» то, что сделано нарочно. Новое решение = новый файл по шаблону.
Старые решения не стираем: если передумали, пишем новое и ставим старому
статус «заменено».

---

Format: [MADR 4.0](https://adr.github.io/madr/) (Markdown Architectural Decision
Records, released 2024-09-17; sections: context and problem statement, decision
drivers, considered options, decision outcome with consequences and
confirmation, pros and cons, more information; checked 2026-10-25). We use the
lean variant: front matter, context, drivers, options, outcome, consequences,
links. Template: [0000-template.md](0000-template.md).

## Rules

1. One decision per file, named `NNNN-short-title.md`, numbers never reused.
2. Statuses: `proposed`, `accepted`, `superseded by ADR-NNNN`, `rejected`.
3. Never edit an accepted ADR except status and links. A changed mind is a new ADR.
4. Back-filled ADRs (written after the fact from `docs/architecture/*`) say so
   in `More information`; their date is the date of the decision, not of writing.
5. An ADR is short (one screen). Long research stays in `docs/architecture/`.
6. Public repo: no secrets, no account ids, no personal data.

## Index

| # | Decision | Status |
|---|---|---|
| [0001](0001-use-madr.md) | Record decisions as MADR files | accepted |
| [0002](0002-postgresql-16-everywhere.md) | PostgreSQL 16 for dev, CI and prod | accepted |
| [0003](0003-logical-shards-and-families.md) | 256 logical shards in three families on one database | accepted |
| [0004](0004-uuidv8-shard-ids.md) | UUIDv8 ids carry the shard | accepted |
| [0005](0005-own-pgbouncer.md) | Own PgBouncer, no RDS Proxy | accepted |
| [0006](0006-cloudflare-sfu-group-calls.md) | Cloudflare Realtime (TURN + SFU) for calls | accepted |
| [0007](0007-r2-public-media.md) | Cloudflare R2 for public media, behind a switch | accepted |
| [0008](0008-opensearch-behind-switch.md) | OpenSearch behind a three-way switch | accepted |
| [0009](0009-append-only-ledgers.md) | Money in cents, append-only ledgers and journals | accepted |
| [0010](0010-no-second-admin-approvals.md) | No second-admin approvals | accepted (in code, PR #336) |
| [0011](0011-monthly-partitioning.md) | Monthly partitioning of big tables | accepted (PR #334) |
| [0012](0012-autoscale-db-and-redis.md) | Database and Redis scale themselves up and down | accepted |
| [0013](0013-expand-contract-rolling-deploy.md) | Expand/contract migrations, rolling deploy, alarm rollback | accepted |
| [0014](0014-no-silent-mock-in-prod.md) | Provider switches never fall back to a mock in prod | accepted |
