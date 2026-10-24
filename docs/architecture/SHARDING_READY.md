# Sharding-ready database (design, 2026-10-24)

## Резюме для владельца (по-русски, простыми словами)

**Что это.** Сейчас вся база — одна большая «картотека» на одном сервере AWS. Когда пользователей будут десятки миллионов, один сервер не потянет, и картотеку придётся разрезать на несколько серверов («шарды»). Если резать позже, когда в базе живые данные, это месяцы тяжёлой работы с риском потерять или сломать данные. Мы предлагаем подготовить разрезание сейчас, пока пользователей нет: заранее «пометить» каждую запись адресом ящика (логический шард), хотя физически все ящики пока лежат на одном сервере.

**Что меняется для тебя.** Внешне ничего. Сегодня расходов нет: сервер один. Дополнительный сервер (Multi-AZ, класс среднего размера) стоит примерно 1,5–2 тыс. долларов в месяц за каждый (оценка, зависит от размера). Платить начнём только когда реально понадобится второй сервер, не раньше.

**Сколько работы сейчас.** Около 60–80 часов работы агентов плюс тесты. Это «лёгкая» подготовка: адреса в идентификаторах, слой маршрутизации, проверка, что код не лезет между «ящиками» где не надо. Полную перестройку (убрать связи между ящиками, кнопка «переехать на другой сервер») делать до запуска не нужно: это ещё 150–250 часов, и разумнее её делать, когда станет ясно, какие данные растут быстрее всего.

**Честный вывод.** Подготовку (этапы 0–1) стоит сделать сейчас: пока нет пользователей, это дёшево, потом — очень дорого. Всё остальное делаем по сигналам нагрузки. Один хороший сервер с репликой чтения и пулером соединений выдержит, скорее всего, первые миллионы пользователей.

---

## 1. What others did (primary sources)

- **Instagram** — logical shards (thousands) mapped to few Postgres hosts; 64-bit ID = 41-bit time + 13-bit logical shard id + 10-bit sequence, generated inside Postgres. Shard is readable from any ID. [Sharding & IDs at Instagram](https://instagram-engineering.com/sharding-ids-at-instagram-1cf5a71e5a5c) (fetch failed from this sandbox; cited from known post).
- **Notion** — shard key workspace id; 480 logical shards (Postgres schemas) on 32 hosts, 15 each; migration = double-write, backfill, dark-read verification, brief downtime. Lesson: shard earlier; a composite key avoids passing the shard key everywhere. [Sharding Postgres at Notion](https://www.notion.com/blog/sharding-postgres-at-notion).
- **Figma** — vertical split first, then horizontal "colos" (tables sharing a key keep joins and transactions); logical sharding via views first (rollback by config), physical second; DBProxy in front of PgBouncer; scatter-gather is costly; cross-shard FKs, transactions, unique indexes unsolved. [How Figma's databases team lived to tell the scale](https://www.figma.com/blog/how-figmas-databases-team-lived-to-tell-the-scale/).
- **Discord** — Snowflake IDs; messages partitioned by (channel, time bucket) in Cassandra, moved to ScyllaDB (177 to 72 nodes) because of hot partitions and GC. [How Discord stores trillions of messages](https://discord.com/blog/how-discord-stores-trillions-of-messages).
- **Slack** — workspace sharding on MySQL hit hot spots with big customers; moved to Vitess with channel-keyed message data. [Scaling datastores at Slack with Vitess](https://slack.engineering/scaling-datastores-at-slack-with-vitess/).
- **Shopify** — pods; shard key shop_id on every shop-owned table; routing table in an unsharded DB; moves via Ghostferry (batch copy + binlog tail, brief per-shop write lock, flip routing, verify, prune). [Shard balancing](https://shopify.engineering/mysql-database-shard-balancing-terabyte-scale).
- **Telegram/WhatsApp** (not re-fetched): custom stores, not relational; ownership by user/chat id. Little transferable detail.
- **AWS options**: Citus is not on RDS. **Aurora PostgreSQL Limitless** automates sharding (shard keys, reference tables, [docs](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/limitless.html)) but has feature limits and lock-in; we are on RDS, so choice is app-level routing. Design below keeps Limitless possible later (explicit shard key on every table).

Common pattern: **one tenant key, logical shards >> physical, shard id inside the ID or on every row, routing table outside, cross-shard FKs dropped.**

## 2. LawBid today (origin/main, measured)

- 239 models, 7013-line schema, 406 relations; 127 of them point at `User`; 128 `onDelete: Restrict` FKs.
- IDs: 160 of 162 PKs are `uuid` via `gen_random_uuid()` (v4, random); 2 autoincrement. No shard info, poor index locality.
- 306 non-spec files inject `PrismaService`; about 3,300 delegate calls (`prisma.x.find/create/...`), 245 `this.prisma`/`$transaction` lines, about 192 raw SQL calls, 53 `$transaction`, 112 files using `withTxRetry`/transactions. Only 3 files use `PrismaReadService`.
- `PrismaService` is already a Proxy over two clients (real + demo DB, picked by AsyncLocalStorage `demoContext`). That is the seam we extend.
- 22 BullMQ files, 14 job/cron files, 165 e2e specs. Search is Postgres FTS (`postgres-search.provider.ts`).

## 3. Shard key: three families, not one

LawBid has no single tenant (unlike Notion's workspace). Data hangs off three roots, so use **colos** (Figma) keyed by:

| Family | Key | Tables (examples) |
|---|---|---|
| **G Global** (never sharded) | none | User, Session, auth, UserIdentifier, Username, billing (Stripe*, Plan, Subscription, Payment, Stars*), admin/audit/moderation, flags, i18n, config, countries, practice areas, verification, search tables, analytics, shard_map |
| **C Case** | `case_id` | Case, Bid, BidOffer, CaseTask*, CaseBilling/Time/Invoice/Sign, Review, ClientReview, CasePayment, Consultation, CaseJournal, and **Conversation + Message + Call** of that case |
| **U User** | `user_id` | Notification, PushToken, Saved*, Follow, Block, Story, ContactMatch, wallets view, DMs (no case): shard by `client_id` |
| **Content** | `author_id` | Post*, Comment, Likes, Channel*, LegalQuestion/Answer |

Case shard = hash(`client_id`) so one client's cases, bids and chats sit together (client lists are single-shard). Attorney views ("my bids") cross shards: scatter-gather over the few physical DBs (cheap at 2 to 8 DBs), or an attorney-side index table in the U family later.

Cannot be sharded: users/auth (every request looks up a user; username/email/bar-number uniqueness is global), billing and Stripe webhooks (money must be one ledger), admin, settings, search index. These stay on one primary DB (G). A G outage is the weak point, so G gets its own Multi-AZ instance and replicas.

Cross-entity queries: **feed** (posts of followed authors across shards) -> fan-out-on-write `feed_item` rows into U shards or a Redis/index timeline; **search** -> move to a dedicated index (OpenSearch/Meilisearch) fed by outbox events; **admin lists/reports/analytics** -> scatter-gather with merge for small lists, CDC/logical replication into a reporting DB for reports; **user joins** (`message.sender`, `bid.attorney`) -> batched `UserDirectory` loader (cached), replacing Prisma `include: { user }`.

## 4. ID scheme

Recommendation: **embed the shard in the ID, no lookup directory.** Keep column type `uuid` (no type migration, no client change): app-generated UUIDv8 = 48-bit ms timestamp | version nibble | **12-bit logical shard** | random. Time-ordered (better index locality than v4), shard readable from any ID (`shardOf(id)`), room for 4096 shards (we use 256). Child rows inherit the parent's shard (case messages get the case shard), which guarantees colocation. Global-family IDs use shard 0. A directory table (id -> shard) would be a hot global dependency on every query; Instagram avoided it.

Migration: no users, so only seed/demo data; new default replaces `gen_random_uuid()` in the schema (DB default stays as fallback with shard 0). Plus a `shard_id smallint` column on every C/U/Content table (denormalised, indexed) for fast copy/verify queries and a future Limitless distribution key. Cost now: near zero. Cost after launch: backfill billions of rows.

## 5. Logical shards on one physical DB

- 256 logical shards; `shard_map(logical_shard, physical_db, state, version)` in G; all 256 -> `db0` today.
- `ShardRouter` caches the map in process (refresh via Redis pub/sub, version-fenced). One Prisma client per physical DB (extending the existing Proxy), each behind its own PgBouncer.
- API: `prisma.forCase(id)`, `forUser(id)`, `forShard(n)`; `prisma.global` for G. A shard context (AsyncLocalStorage, set by an interceptor from `:caseId`/`:conversationId` route params) keeps most of the ~3,300 calls unchanged. Bare `this.prisma.x` stays valid while only one physical DB exists (it resolves to db0); an ESLint/arch test flags new cross-family includes so we do not accumulate debt.
- Single schema with shard column, not 256 Postgres schemas (Notion): 256 schemas multiplies migrations and Prisma clients.

**The "move shard" button** (admin, per logical shard), honest procedure: (1) preflight: target schema up to date, capacity ok; (2) mark `migrating`; (3) snapshot copy of all colo tables by `shard_id` (manifest-driven) to target; (4) catch-up: tail changes (logical replication with `shard_id` filter, or `updated_at` + outbox; needs a spike, since PG row filters on UPDATE/DELETE only see replica-identity columns); (5) short write lock for that shard (Redis lock, seconds), drain, final catch-up; (6) verify row counts + checksums per table; (7) bump `shard_map` version, release lock; (8) keep old rows 7 days, then delete. Risks: in-flight transactions and jobs holding stale routes (fence by version), long locks on huge shards (so keep shards small: 256+), rollback after step 7 requires reverse sync, sequences (only 2 tables), and timing of cache propagation.

## 6. Code impact

- Roughly 70% of calls touch C/U/Content tables: about 2,300 calls in about 220 files. With the shard context most need **no edit**; expect about 300 to 500 explicit call-site changes (jobs, sockets, webhooks, admin, anything without a route param).
- Must redesign: feed, search, admin lists (about 20 modules), reports, "my bids", notifications fan-out, counters reconcile, rating reconcile.
- **Transactions**: stay inside one family/shard. Cross-family ones (e.g. accept bid also writes user counters, notifications, billing) -> outbox + idempotent consumer. Audit the 53 `$transaction` sites.
- **Unique constraints**: per-shard ones fine; global ones (username, email, bar number, promo codes) live in G.
- **Foreign keys**: keep within family; to `User` (127) become plain uuid after the first physical split, plus a nightly orphan checker. Until then FKs may stay (one DB), which is why splitting is a later, bounded step.
- **Jobs/BullMQ**: queues stay global; payloads carry shard; crons use `forEachShard()`.
- **Realtime**: Redis rooms keyed by IDs, unchanged.
- **Migrations**: `prisma migrate deploy` looped over distinct physical DBs by a runner; N=1 now.
- **Backups**: per-instance snapshots/PITR; no cross-DB consistent point, so rely on the integrity checker.
- **PgBouncer**: one per physical DB, transaction mode; per-client pool sizes capped so N clients x pool <= max_connections.
- **Tests**: a "two-DB mode" in CI where even shards map to db0 and odd to db1.

## 7. Phased plan (agent hours incl. testing)

| # | PR-sized step | Hours | When |
|---|---|---|---|
| 0 | Family manifest + arch lint (no cross-family includes) | 8 | now |
| 1 | UUIDv8 generator + `shardOf`, used by new rows | 10 | now |
| 2 | `shard_id` column on C/U/Content tables (script-generated migration) | 12 | now |
| 3 | `shard_map`, `ShardRouter`, per-DB client in Proxy, `forCase/forUser` | 16 | now |
| 4 | Shard-context interceptor + sockets/jobs/webhooks context | 14 | now |
| 5 | Two-DB test mode + e2e green on both | 16 | now |
| 6 | `UserDirectory`, remove user includes across families | 50 | before 2nd DB |
| 7 | Outbox for cross-family writes; audit 53 transactions | 30 | before 2nd DB |
| 8 | Feed fan-out, search index, admin scatter-gather, reporting DB | 80+ | by traffic |
| 9 | Drop cross-family FKs, orphan checker | 20 | at 2nd DB |
| 10 | Move-shard tool + admin button + runbook | 50 | at 2nd DB |

Steps 0 to 5 are about 76 h, zero behaviour change, can ship pre-launch. 6 to 10 wait.

## 8. Risks and tests

Biggest: (a) wrong family assignment (a table used both ways) -> rework; (b) hidden cross-family `include`/raw SQL (192 raw calls) breaking at first split; (c) a Global-DB bottleneck; (d) move tool data loss; (e) over-investment for a load that may never come. Tests: full e2e (165 specs) on one-DB and two-DB modes; load tests with shard routing on; per-shard checksum and orphan-FK checks; shadow/dark reads during any real move; chaos test killing the API mid-move.

## 9. Recommendation

Do steps 0 to 5 now (about 76 h): cheap insurance, because IDs and a shard column are nearly free today and brutal to retrofit. Do not drop FKs, build the move tool, or buy a second RDS before launch. Triggers for step 6+: primary CPU >60% sustained after replicas and pooler, any table >500 GB, or write IOPS near the instance limit. Realistically Notion and Figma ran monoliths for years; most scale headroom comes from Multi-AZ, replicas, PgBouncer, and partitioning `messages`/`notifications` first.
