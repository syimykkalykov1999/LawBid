---
status: "accepted"
date: 2026-10-24
decision-makers: owner + Claude
---

# 256 logical shards in three families, all on one database for now

## Context and problem statement

One Postgres server will not carry tens of millions of users. Cutting a live
database later costs months and risks data; before launch there are no users.
LawBid has no single tenant key (unlike Notion's workspace). What do we prepare now?

## Decision drivers

- Cheap today: no second server until a load signal says so.
- Retrofitting a shard key after launch means backfilling billions of rows.
- Joins and transactions must stay inside one unit.

## Considered options

- Logical shards plus "colo" families (global, case, user, content), physical split later (chosen)
- Do nothing now, split when needed
- Aurora PostgreSQL Limitless
- Move to a natively distributed database

## Decision outcome

Every Prisma model belongs to exactly one family in `shard-manifest.ts`.
`shard_map` maps 256 logical shards to physical databases; today all map to
`primary`. A `shard_id` column exists on every sharded table. Case shard =
hash of the client id, so a client's cases, bids and chats sit together. Global
data (users, auth, billing, admin, config) never shards.

### Consequences

- Good: no behaviour change today; the later split is a bounded project (steps 6-10 of the plan).
- Bad: new code must respect families; cross-family transactions become outbox events; feed, search and admin lists need scatter-gather.
- Confirmation: `shard-manifest.spec.ts`, `cross-family-include.spec.ts`, and the two-database e2e mode (`npm run test:e2e:two-db`, worklist in `apps/api/test/two-db-suites.json`).
- Triggers to actually split: primary CPU above 60 percent sustained after replicas and pooler, a table above 500 GB, or write IOPS near the limit.

## More information

[SHARDING_READY.md](../architecture/SHARDING_READY.md) (sources: Instagram, Notion, Figma,
Shopify, Slack, Discord engineering posts). Back-filled 2026-10-25.
