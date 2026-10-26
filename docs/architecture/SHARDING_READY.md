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

## 10. Status of steps 3 to 5 (2026-10-24)

**По-русски:** шаги 3-5 сделаны, для пользователей ничего не меняется. Есть таблица «какой шард на каком сервере» (пока все на одном), маршрутизатор, который выбирает сервер по делу или пользователю, и «контекст шарда» на запросах, сокетах и фоновых задачах. В тестах появился режим с двумя базами: в нём зелёные 46 наборов, а 113 наборов честно записаны как «известные ограничения» (они ждут шагов 6-8: связи между «ящиками» и транзакции через несколько «ящиков»).

**Step 3 - routing.**
- `shard_map(logical_shard 0..255, physical_db, state, version)` (global family, migration `20261024150000_shard_map_and_triggers`), seeded `primary` x 256. A missing row or a missing table also means `primary`.
- `ShardRouter` (`src/sharding/shard-router.ts`): synchronous lookups from an in-process copy, loaded at start-up, refreshed in the background after `SHARD_MAP_TTL_MS` (default 30 s) and on a Redis message (`ShardMapSync.invalidate()`, channel `lawbid:shard-map:invalidate`), version-fenced (an older map never replaces a newer one); a failed load keeps the previous map.
- `PrismaService` is still one Proxy, now over one extended client per physical database: `primary` = `DATABASE_URL`, others from the optional `DATABASE_URL_SHARDS` JSON (`{"db1":"postgresql://..."}`, pool size `DB_POOL_SIZE_SHARD` or `DB_POOL_SIZE`). New: `prisma.forShard(n)`, `forCase(id)`, `forUser(id)`, `global()`. Demo mode still wins over everything. With one physical database all of them return the same client. A map entry naming a key missing from `DATABASE_URL_SHARDS` throws `ShardDatabaseNotConfiguredError` (silently using the wrong database would be worse).
- Routing of bare `this.prisma.x`: a delegate of a GLOBAL model always uses `primary`; a delegate of a sharded model follows the shard context; `$transaction`, `$queryRaw` and friends follow the shard context. A transaction therefore runs on ONE database, which is the plan's rule "transactions stay inside one family/shard".

**Step 4 - shard context** (`src/sharding/shard-context.ts`, AsyncLocalStorage, default = primary, never throws).
- HTTP: `ShardContextInterceptor` (APP_INTERCEPTOR) reads only path params: `:caseId`/`:conversationId`/`:bidId`, `:id` under case-family and content routes (cases, bids, conversations, calls, messages, reviews, client-reviews, case-comments, payment-requests, posts, comments), `:userId`, and falls back to the signed-in user as a WEAK context (source `auth`).
- Sockets: the realtime gateway runs every packet in the connecting user's shard (source `socket`, also weak); handlers that touch another entity use `shardContext.runForCase(id, fn)`.
- BullMQ: put `...shardCarry()` into the job data (adds `shardKey: "shard:N"`) and run the handler in `shardContext.runFromKey(data.shardKey, fn)`; no key = primary. Wired for the channel and group fan-out jobs; other queues carry no sharded entity yet. Keys can also be `case:<id>` / `user:<id>`. Webhooks: call `runForCase` / `runForUser` once the entity is known.
- Metric: every query on a sharded-family model with no context, and every one under only a weak context, is counted per model and logged once a minute per process as `{metric:"shard_no_context", total, byModel, weakTotal, weakByModel}` (`src/sharding/shard-stats.ts`). Steps 6-8 use it as the to-do list of call sites.
- `shard_id` gaps from PR #314 closed: the raw INSERTs of `notifications`, `call_log_hidden` and `post_view_events` set `shard_id`; every other path (nested relation creates, the `channel_post_views` raw insert, future raw SQL) is covered by the BEFORE INSERT trigger `lawbid_shard_fill` on all sharded tables (owner column: last byte of the owner uuid; parent column: the parent's `shard_id`; fires only when `shard_id = 0`). The trigger list is generated from the manifest (`scripts/generate-shard-trigger-migration.ts`, guarded by `shard-trigger-migration.spec.ts`).
- Known gap: a LEGACY random v4 case/post id has no shard inside it, so `shardOf(id)` gives its last byte, not its stored `shard_id` (the hash of the owner). Harmless while all shards are on one database; before the first real split such rows (seed/demo data only) must be re-keyed, or the router must read `shard_id`.

**Step 5 - two-database e2e mode.**
- `E2E_TWO_DB=all` (deterministic, used in CI) puts every logical shard on a second database; `E2E_TWO_DB=odd` is the plan's mixed map (odd shards on db1), nondeterministic because the random user ids may be odd or even (45 of the 46 gated suites also pass on it; `owner-economy` does not). The second database is `<e2e db>_s1` on the same server, migrated like the first. Foreign keys between different families are dropped in both databases (what plan step 9 does for real; otherwise nothing sharded could reference a user on the other database). `shard_map` is re-seeded after each test-database reset.
- Run: `E2E_TWO_DB=all npm run test:e2e:two-db --workspace apps/api` (CI: step "e2e tests on TWO databases" in `.github/workflows/api-ci.yml`). It runs the suites under `run` in `apps/api/test/two-db-suites.json` (46 suites, 246 tests) and prints the known limitations; `--all` runs everything to re-measure.
- `test/shard-routing.e2e-spec.ts` proves rows really land on the second database (and only there), that global models ignore the context, that explicit `forShard` agrees with the context, and that the no-context counter ticks. `test/shard-triggers.e2e-spec.ts` covers the trigger.
- **Known cross-DB limitations** (`knownLimitations` in the JSON, 113 suites; each has `kind`, the plan step that fixes it and its first failing test). They pass on one database and are listed, not run, in two-DB mode:
  - `write` (56): one request writes rows of two families in one transaction (for example creating a case also writes `user_consents`, counters or a notification). Fix: step 7 (outbox, audit of the 53 transactions).
  - `read` (57): a response joins or lists across families or shards (feed, lists, counters, cards with `include: { user }`), or the suite seeds/reads sharded rows with an unscoped client that only sees the primary database. Fix: step 6 (`UserDirectory`) and step 8 (feed fan-out, scatter-gather).
  - Six suites also fail on one database when the local `.env` lacks Stripe keys, DB roles or MailHog (`environmentOnly` in the JSON); unrelated to sharding.

## 11. Status of steps 6 and 7 (2026-10-25)

**По-русски:** шаги 6-7 сделаны в рабочем объёме. Появился общий «справочник пользователей» (один запрос на пачку вместо связей между «ящиками»), «почтовый ящик исходящих событий» для записей, которые затрагивают два «ящика», и несколько общих механизмов, которые чинят целые классы мест сразу. Для пользователей на одной базе ничего не меняется (всё включается только при второй базе). В режиме двух баз зелёных наборов стало 84 (было 44); осталось 76, в основном сырой SQL с соединениями между семействами и ленты/поиск (шаг 8).

**Step 6 - UserDirectory** (`src/sharding/user-directory.ts`). Research: DataLoader's per-tick batching and "fresh loader per request" advice (NestJS/GraphQL write-ups, 2025-26); we keep the batching and drop the per-request memo on purpose (a request that edits a user and reads it back would see stale data).
- `userDirectory(prisma).select(ids, select)` batches ids asked in the same tick (per projection) into one `id IN (...)` query, returns soft-deleted users like a to-one include, never cached. `cards(ids)` returns the public card only (`USER_CARD_SELECT`: name, avatar id, role, status, usernames, badge flags) and caches it in Redis (10 s, off with one database, `USER_DIRECTORY_CACHE_TTL_SECONDS`). `attachUsers(prisma, rows, 'client_id', 'client', select)` stitches under the old key; shapes are byte-identical.
- Explicit conversions (allowlist 67 -> 52 edges, 32 -> 24 files): reviews, client reviews and appeals, follows, blocks, post author / afterPublish / shared post cards, account anonymization, conflict check, "Mine" work list.
- **Runtime net** (`cross-family-stitch.ts`): on a non-primary database client, a to-one include from a sharded model into a global one (users, practice areas, files, tags ...) is loaded from the primary database in one batch and put back, wherever the include was built (shared constants, spreads). It covers the long tail the static ratchet cannot see (the ratchet still counts 52 visible edges).
- Not covered (step 8): relation FILTERS in `where` / `orderBy` (`VISIBLE_POST_WHERE` filters posts by `author`), to-many relations into a global model, raw SQL joins (case access, subscription alerts, rating reconcile, storage counters). Raw-SQL case access has a split implementation (`CaseAccessPolicy.decide`, used with several databases or `SHARD_SPLIT_READS=on`).

**Step 7 - outbox** (`src/sharding/outbox`, migration `20261025090000_cross_family_outbox`, ERD regenerated). Research: transactional outbox with an inbox for idempotent consumers, short claim transactions, `FOR UPDATE SKIP LOCKED` leases, mark-after-apply (Postgres outbox write-ups, 2026).
- `cross_family_outbox` (on every physical DB) + `cross_family_inbox` (primary). `emit(tx, type, payload, key)` inside the transaction; `flush(tickets)` after the commit; `sweep()` is the BullMQ cron `outbox.sweep` (every minute): exponential backoff 5 s .. 1 h, 8 attempts, then `dead` (log metric `cross_family_outbox_dead`, `retryDead()`).
- One database: the effect runs inline in the same transaction, nothing is stored, atomicity and outcome are exactly the old ones (proved by the same e2e suites on one database). `CROSS_FAMILY_OUTBOX_MODE=always` forces the stored path.
- Converted: the `client_contact_sharing` consent at `POST /cases`; the attorney rating recalculation of reviews and moderation (summed over all databases, exact SQL rounding on the global side).
- **Global first (not an event)** for money and permissions: subscriptions, payments, stars, bans, roles. The generic **tx facade** (`tx-global-facade.ts`) makes a plain `tx.<globalModel>` inside a transaction on a non-primary database answer from the primary database: reads are right, writes commit first and are counted (`shard_tx_global_write`), so each such site shows up as a to-do for the outbox when it is not money.
- Other generic pieces: queries on sharded models without a strong shard context are routed by the entity named in their arguments (`shard-args.ts`) or scattered over the databases and merged when the merge is exact (`scatter-gather.ts`, metric `shard_scatter`); `forEachDatabase` for sweeps.

**Two-DB gate:** 84 suites in `run` (was 44), 76 in `knownLimitations` (was 115): 36 write, 40 read. Six suites that used to pass only because everything hit the primary database moved back to the limitations (their raw SQL joins and primary-only seeding are real step 8 work).

## 12. Status of step 8 (2026-10-25)

**По-русски:** шаг 8 сделан частично, чисто и без изменений для пользователей на одной базе. В режиме двух баз зелёных наборов стало 115 (было 84), «известных ограничений» 45 (было 76). Лента кейсов и поиск кейсов теперь читают «со всех баз и сливают» (не раздают ленту заранее). Осталось: поиск постов и людей (длинные SQL-соединения, их место во внешнем поисковике), часть записей через несколько «ящиков» и пара админ-отчётов.

**Decisions (per case, as the plan asks).**
- **Relation filters in `where`** (`VISIBLE_POST_WHERE` and everything like it): resolved as a *two-step query* inside the include-stitching extension (`cross-family-stitch.ts`). A to-one filter from a sharded model into a global one (`is` / `isNot` / `null`, under AND / OR / NOT, in nested relations and in `include` sub-queries) first asks the primary database for the matching ids and the shard query gets `<fk> IN ids`. Exact; one extra primary query per filter. A denormalized column kept by the outbox (for example an author-visible flag on posts) is the better shape once the matching set reaches the hundreds of thousands; it is a later optimisation, not needed for correctness. Relation *ordering* and to-many filters into a global model are still not covered.
- **groupBy / aggregate** scatter-merge (`scatter-gather.ts`): exact for `_count`, `_sum`, `_min`, `_max` (groupBy: same-key groups merged, re-sorted by plain or aggregate `orderBy`, `skip`/`take` re-applied). **Not exact, never scattered:** `_avg` (needs sum and count per database), `having` (a threshold on a partial aggregate drops groups whose total passes), `cursor`, `take`/`skip` on `aggregate`.
- **Find-one operations** without a shard (`update`, `delete`, `findUniqueOrThrow`, `findFirstOrThrow` by a legacy random id) try each database in turn and only continue on "record not found". `in: [...]` lists pin a shard only when every element agrees.
- **Feed = scatter-read, not fan-out-on-write.** The attorney case feed is "every open case matching my licences and topics, newest first": each case is visible to a very large, changing set of readers and changes state often, so a per-reader feed table would be written and then repaired constantly. The global parts (licences, topics, blocks, category leaves) are resolved first in application code (`cases-visible.sql.ts`), the case-only statement runs on each database with the same `LIMIT`, and the sorted pages are merged by `(created_at, id)` (exact keyset merge). One database keeps the original single statement. Case search uses the same path (per-database `statement_timeout` / trigram threshold in the same transaction). Research (web search, 2026-10-25): general system-design sources agree that push suits many readers per author with a cheap read path and pull suits very large audiences, with a hybrid for celebrities; no usable first-party write-up on how Notion, Figma or Instagram do cross-shard feed or search was found, so this is our own conclusion for our shape, not a copy. Revisit fan-out for the client *post* home feed (follow graph) when it is built.
- **Raw SQL that joined families**, made shard-aware with the existing split-read switch (`readsAreSplit`, `SHARD_SPLIT_READS=on` forces it on one database so both paths are tested against the same suites) or `forEachDatabase`: subscription alerts, rating reconcile, review reminder, counters flush and reconcile, `visibleCaseIds`, storage cleanup (unused-file scan), retention sweeps, disappearing-messages sweep, journal retention and integrity. Account anonymization and admin bulk actions run in the right shard. Sessions cleanup now removes push tokens itself (the cross-family `ON DELETE CASCADE` is gone after step 9; every such cascade needs an explicit delete or the orphan checker).
- Two real bugs found by the two-DB mode and fixed: the call log message and the post-view event were written in the viewer's shard instead of the chat's / post's.

**Gate.** `run`: 115 suites (was 84), `knownLimitations`: 45 (was 76): 21 write, 24 read. `owner-economy` and `owner-admin-flex` pass locally but are flaky / failing only in CI, so they stay listed. Suites that seed or inspect sharded rows with a plain `PrismaClient` or an unscoped `$queryRaw` were fixed in the suite (`test/support/rows-on-any-db.ts`).

**What remains (the worklist is `knownLimitations`).**
- Posts search and people search (`postgres-search.provider.ts`): long raw statements joining users, profiles, licences, posts. Plan: move to the external engine of `SEARCH_READY.md`; until then they are correct on one database only.
- Writes that span families in one transaction (mostly notifications + counters + stars): convert to outbox events or global-first writes one by one (money and permissions stay global-first, never events).
- To-many includes from a global model into a sharded one (`user.cases_as_client`), relation ordering, `_count` through a global relation.
- Dashboards and admin reports that sum over shards (use `forEachDatabase` + `groupBy` merge).
- `RETENTION_DATABASE_URL` is one URL, so the journal retention role covers one database only; set one per database before the first real split.

## 13. Status of steps 9 and 10 (2026-10-26)

**По-русски:** шаги 9-10 сделаны. Есть инструмент «переезд части базы на другой сервер» (команда и кнопка «Разделить базу» на странице «Здоровье системы»): копирует данные одной части, догоняет изменения, на секунды замораживает запись, сверяет количество и контрольные суммы, переключает маршрут и 7 дней хранит старое. До переключения всё откатывается без следа, после переключения откат тоже есть (изменения возвращаются на старый сервер). Связи между «ящиками» убираются отдельной безопасной командой (не миграцией), а их роль берут ночная проверка «осиротевших» записей и заглушки вместо пропавших пользователей. Чтобы реально разделить базу, владельцу нужно: создать второй сервер RDS, прописать его в `DATABASE_URL_SHARDS`, применить миграции, нажать кнопку (подробно: `docs/runbooks/shard-move.md`).

### Research (live web search, 2026-10-24)
- **Logical replication with row filters (PG 16):** if a publication publishes UPDATE or DELETE, the row filter may use only columns of the table's REPLICA IDENTITY (the primary key by default), because the old row image of an UPDATE/DELETE carries only those columns; INSERT-only filters have no such limit. `shard_id` is not in our keys (33 tables have composite keys without it), so `WHERE shard_id = N` would be refused or need `REPLICA IDENTITY FULL` (whole old rows in WAL) on 104 tables. Source: PostgreSQL 15-18 docs, "Logical replication: row filters" and CREATE PUBLICATION.
- **RDS:** logical replication needs the static parameter `rds.logical_replication = 1` (sets `wal_level = logical`); changing it **requires a reboot** (AWS RDS docs, logical replication / pglogical setup, checked 2026-10-24), plus the `rds_replication` role for slots. A reboot of a Multi-AZ prod instance is a maintenance window we prefer not to need.
- **COPY-based moves:** Citus' shard mover has two modes: logical replication (copy while writes continue, a brief write lock only at the metadata flip) and `block_writes` (lock the shard for writes while copying, reads continue), the fallback without logical replication (Citus docs v7-v9; Citus 11.1 post, 2022).
- **How others cut over:** Notion (2021) double-wrote to old and new, backfilled, ran dark reads to compare and took about five minutes of scheduled downtime for the switch; it rejected logical replication for the double write because it could not keep up with its busiest table. Figma (2023-24) did logical sharding first (views, rollback by config), then a physical failover with about 10 seconds of availability impact on the primary. Shopify's Ghostferry copies in batches, tails the binlog, takes a brief per-shop write lock, flips routing, verifies, prunes. Common shape: copy, catch up, **short** write freeze, verify, flip. (Instagram's post could not be fetched here; it embeds the shard in the ID, which steps 1 and 3 already do.)

### Decision: trigger-based change capture + short write freeze, not logical replication
For each moving logical shard the source gets, on every sharded table, one BEFORE row trigger (`lawbid_shard_move_guard`, migration `20261102200000_shard_move_tool`, installed only for the duration of a move). It (a) appends the **primary key** of every changed row of that shard to `shard_change_log`, and (b) is the **write fence**: when the shard's `frozen_until` is in the future (or `infinity` on the old copy after the flip) it raises SQLSTATE `55P03`. Replay reads the *current* row by key from the source and upserts it into the target (or deletes it there when gone): no old-row images, no REPLICA IDENTITY, no slots, no reboot, idempotent.

| | trigger log + freeze (chosen) | logical replication with row filter |
|---|---|---|
| RDS reboot / parameter change | no | yes (`rds.logical_replication`) |
| Needs `shard_id` in the key / REPLICA IDENTITY FULL | no | yes for UPDATE/DELETE |
| Write pause | seconds per shard (final catch-up + verify) | milliseconds at the flip |
| Extra cost on the source | one small insert per changed row of the moving shard, only during the move | WAL decoding, slot retention risk |
| Scale ceiling | fine for shards up to a few million rows (a shard is 1/256 of the data) | better for huge shards |

If one shard ever gets too big for a seconds-long verify, switch only `applyLog` to logical replication (enable `rds.logical_replication` in a planned window); the state machine stays.

### The move (src/sharding/move)
States: **preflight -> copy -> catchup -> freeze -> verify -> flip -> (7 days) -> cleanup -> done**.
- **preflight** (also the **dry run**, `plan`, writes nothing): target configured, reachable, all migrations applied; target holds no rows of the shard; no other move tracks it; no row of the shard has a foreign key to a row of another shard; no legacy random-v4 id would be routed elsewhere than it is stored (see "Legacy ids"); per-table row counts and a time estimate.
- **copy:** drops the cross-family foreign keys on both databases (step 9, recorded), installs tracking on the source, copies every table parent-first in keyset batches by primary key (rows travel as JSON text, so 64-bit values stay exact). Cycles and self references are broken on nullable columns only (Case.accepted_bid_id, reply_to_id, parent_comment_id ...) and filled in a second pass, so no superuser right (`session_replication_role`) is needed on RDS. Per-table cursors are saved after every batch.
- **catchup:** replays the change log in rounds while writers run, until fewer than 200 entries wait.
- **freeze:** sets `frozen_until` (60 s, renewed). The guard takes `FOR SHARE` on the shard's track row, so the freezing UPDATE waits for in-flight writers (the drain) and a Serializable writer with an older snapshot retries (40001). If the mover dies the freeze expires by itself. Then the final catch-up (the log is complete).
- **verify:** per table, row count and an order-independent checksum (`sum(hashtextextended(row::text))`) on both sides. A mismatch unfreezes and fails the move; `resume` goes back to catch-up. Nothing is flipped on a mismatch.
- **flip:** arms tracking on the target (for reverse sync), fences the old copy permanently, bumps `shard_map` (version = highest + 1), calls `ShardMapSync.invalidate()` (this process now, the others on the Redis message, 30 s TTL as backstop). A stale process that still writes to the old copy gets `55P03` instead of losing data silently.
- **cleanup:** only after `cleanup_after` (7 days) and only if the map does not point at the database being emptied: deletes the old rows, drops tracking and triggers.
- **Resumable, idempotent, leased:** state and cursors live in `shard_moves`; every step is an upsert or guarded update; one Redis lease (`lawbid:shard-move:lease`, 60 s, renewed per batch, token-checked) allows one runner at a time across API, worker and CLI; a runner that loses it stops. Cron `shard.move-tick` (every minute) continues queued/interrupted moves and runs due cleanups.
- **Rollback:** before the flip: unfreeze, delete the target copy, remove tracking, `shard_map` untouched. After the flip (before cleanup): the target's change log is replayed into the old copy under a freeze, verified, `shard_map` flipped back, the old copy unfenced, the abandoned copy kept 7 days. Reverse sync works only while the old rows exist and costs one log row per write during the retention window.
- **Foreign keys (step 9):** `dropCrossFamilyForeignKeys` / `restoreCrossFamilyForeignKeys` (CLI `fk-drop`, `fk-restore`). A tool, not a migration: a migration that drops them makes `prisma migrate diff` report drift forever and a deploy rollback cannot undo it; the DDL of each dropped constraint is stored in `shard_dropped_fk`. **Application-level integrity:** the nightly cron `shard.orphan-check` (`OrphanChecker`) scans the distinct values of every cross-family column in bounded pages with a Redis cursor, looks for the parent on the database(s) that can hold it and logs `{"metric":"cross_family_orphans"}` at error level (the alert log; the last report shows on the admin page). `UserDirectory.attachUsers` and the include stitcher return a **ghost** (selected fields null) for a required user that is gone, and the three `!` sites (client-review appeals, client-review lists, «Мои» work list) fall back to a placeholder.
- **Legacy ids (decision):** a legacy random v4 id has no shard inside, so `shardOf` gives its last byte, not its stored `shard_id`. Re-keying primary keys would have to rewrite every plain-uuid reference in other families (the cascading foreign keys are gone), and an id directory would be a hot global dependency (the plan's own argument against it). The data is seed/demo only, so the tool **refuses to move a shard whose id-routed rows would be routed elsewhere** and names the tables; remove such rows (`scripts/prelaunch-wipe.ts`, or keep demo data in the demo database) before the split. New rows always carry their shard.

### Admin: «Разделить базу»
Batch D's «Масштаб» page (PR #327) is not on main, so the card is on **Система -> Здоровье системы** (`apps/admin/src/components/system/shard-split-card.tsx`). Endpoints (`admin/shards`, super_admin, every action audited): `GET overview`, `GET split-plan?toDb=` (which logical shards, rows, estimate, DATABASE_URL_SHARDS readiness), `POST split` (one fresh 2FA code, no second admin: the owner forbids four-eyes), `GET moves/:id` (live progress), `POST moves/:id/rollback`, `POST moves/:id/resume`. Runbook: `docs/runbooks/shard-move.md`.

### Tests
Unit: every state of the runner with fakes (`shard-move.runner.spec.ts`), plan and SQL (`move-plan.spec.ts`), progress view, orphan checker. E2E on two real databases (`test/shard-move.e2e-spec.ts`, part of the two-DB gate): dry run; a move with a writer running during it (no acknowledged write lost, verified, flipped, reads follow, old copy fenced, cleanup); rollback before the flip; rollback after the flip (reverse sync); duplicate move refused; orphan detection. Passes in `E2E_TWO_DB=odd` and `all` (the direction follows the map).

### Not done / limits
- The Dart client in `packages/api-contract/dart` was not regenerated for the new admin routes (admin only; the mobile app does not call them).
- `cross_family_outbox` rows are per database, not per shard: pending ones of a moved shard stay on the old database and are still relayed by the sweep there.
- Logical replication is documented as the upgrade path, not built.
- Migrations are applied to every database by hand (or by the deploy job once it loops over `DATABASE_URL_SHARDS`).
