# Load and speed audit #6 (2026-10-23)

Question: what would make us slower, heavier, costlier or less reliable than
Instagram / TikTok / WhatsApp / Telegram once we are big, and what can be
fixed now instead of listed. Thinking in **billions of users**: every
number below was measured on a seeded database and then multiplied up, never
guessed. Not repeated here (see the other files in this folder): server load
audit, system audit #2, security audits 3 and 5, product audit 4, client
economy, admin economy, scale limits (heap, pool from the RDS class, WAF,
client knobs, retention) and the realtime lifecycle work.

## How it was measured

| Item | Value |
|---|---|
| Data | `scripts/ops/admin-load-gen.sql` (100 000 users, 300 000 posts, 50 000 cases, 150 000 bids) + new `scripts/ops/user-load-gen.sql` (30 000 reels, 90 000 follows, 900 000 post likes, 50 000 chats / 1 000 000 messages, 1 000 000 notifications, 600 000 view events) |
| Tools (all in `apps/api/bench`) | `mint-tokens.mjs` (tokens without login), `workload.mjs` (autocannon over the hot endpoints), `trace.mjs` (SQL statements per request), `redis-trace.mjs` (Redis commands per request), `query-count.mjs`, `autoexplain-top.mjs` (+ Postgres `auto_explain`), `prof-top.mjs` (`node --cpu-prof`), `throttle-check.mjs` |
| Machine | one MacBook (Apple silicon), ONE Node API process, Postgres 16 and Redis 7 in Docker on the same machine, another worker running at the same time. Absolute numbers are therefore lower than a real task; **before/after on the same machine, one after the other, is what counts** |
| Per-user limit | the API's own limit (100 requests / minute / person) makes cheap endpoints answer 429 above ~500 req/s with 300 test accounts; only endpoints below that are compared |

## Before and after (same machine, 20 connections, 6 s each, back to back)

| Endpoint | req/s before | req/s after | p50 before | p50 after | p97.5 before | p97.5 after |
|---|---|---|---|---|---|---|
| `/me/session` (app start) | 346 | **519** | 57 ms | **38 ms** | 83 ms | **54 ms** |
| `/feed` | 432 | 502 | 43 ms | 38 ms | 75 ms | 63 ms |
| `/reels` | 366 | 399 | 53 ms | 50 ms | 76 ms | 62 ms |
| `/conversations` (chat list) | 421 | 504 | 44 ms | 38 ms | 74 ms | 53 ms |
| `/notifications` | 1 695 | **2 348** | 11 ms | 8 ms | 19 ms | 12 ms |
| `/attorneys/:username` | 455 | 543 | 42 ms | 36 ms | 61 ms | 47 ms |
| `/posts/:id` | 534 | 571 | 36 ms | 34 ms | 51 ms | 45 ms |
| `/search/attorneys` | 715 | 821 | 27 ms | 23 ms | 42 ms | 33 ms |
| `/search/people` | 516 | 743 | 33 ms | 26 ms | 78 ms | 35 ms |
| `/attorneys/me/profile` | 738 | **1 147** | 20 ms | 17 ms | 68 ms | 24 ms |

Where the gain comes from: every request got cheaper (one Redis call for the
rate limit instead of six, a 4x faster token check), `/me/session` and the
chat list ask the database less, and the profile endpoints no longer write.

Database round trips per request (cold user, after the fixes): `/me/session`
13 (was 15), `/feed` 23, `/conversations` 12, `/reels` 19, `/notifications` 1,
`/badges` 1, `/search/attorneys` 10, `/config/bootstrap` 4.

## Findings

Status: **fixed** = in this branch with tests; **switch** = exists now, off
until the owner flips it; **design** = needs a decision / bigger work (listed
with the number that says when).
Ladder step = the size at which the item starts to matter (10k / 100k / 1M /
10M / 100M / 1B users).

| # | Finding | Evidence | Fix | Status | Ladder |
|---|---|---|---|---|---|
| 1 | Every request spent **6 Redis commands and 2 round trips** on the rate limit (PTTL, MULTI, INCR, PEXPIRE, PTTL, EXEC) | `redis-trace.mjs`: `/badges` = 8 commands of which 6 were the limiter | One Lua call: 1 command, 1 round trip, same behaviour (counts, block, stays blocked: `bench/throttle-check.mjs`) | fixed | 1M: at 420 000 req/s peak this is 2.1 M Redis commands/s less |
| 2 | A reels page read **~10x more rows than needed**: the query could not use the partial index made for it | `EXPLAIN ANALYZE`: 24.8 ms, 1 664 buffers, scan of 220 posts for 21 reels; with `video_asset_id IS NOT NULL` in the WHERE: 0.66 ms | the explicit condition in `listReels` | fixed | 100k (every reel swipe page) |
| 3 | Every profile open was **a database write on one hot row** (`attorney_profile_views`, a popular attorney = a queue of locks on one row) | `auto_explain`: 221 ms for one such upsert at 20 parallel opens of one profile | counted in memory, one multi-row upsert every 10 s (`WriteBehindCounter`, flushed on shutdown) | fixed | 1M (one celebrity profile, 5 M opens/day = 58 writes/s on a single row) |
| 4 | `/me/session` asked the same five questions twice (once for the ETag, once for the body) | `trace.mjs`: 15 statements | the ETag inputs are reused by the body | fixed | 100k (every app start that is not a 304) |
| 5 | The chat list **wrote inside a GET**: for each unread-delivery chat (up to 20) it ran a separate SERIALIZABLE transaction (`BEGIN`, `SET TRANSACTION`, read, `UPDATE`, `COMMIT`, plus the checks) one after the other | `trace.mjs` on `/conversations`: the whole transaction sequence visible per chat | one forward-only `UPDATE ... FROM unnest(...)` for all chats; only chats that really moved are announced | fixed | 100k: a phone that was off for a day |
| 6 | Token check `createPublicKey` threw and caught an exception **on every request** (jsonwebtoken tries a public key before an HMAC secret when given a string) | 17.5 µs per verify; `--cpu-prof`: `createPublicKey` + crypto keys 3.5 % of CPU | verify with a ready `KeyObject` | fixed | 10M (≈ 5.7 CPU cores saved at 420 000 req/s) |
| 7 | **Cache stampede**: when a hot key expires or an admin edit clears it, every request in that instant runs the same query (search results, bootstrap content, feature flags, app config) | none existed (`singleFlight` was nowhere) | `singleFlight` (one refill per process) + TTL jitter ±20 % | fixed | 100k+ |
| 8 | **No read-replica path**: every read, including lag-tolerant search, hits the primary | code review | `PrismaReadService`: set `DATABASE_REPLICA_URL` and search reads move to the replica, no deploy; falls back to the primary for 15 s when the replica is unreachable; off by default | fixed (seam) + switch | 1M |
| 9 | **No event-loop-delay metric**: CPU % cannot show a blocked Node process | none in code | one CloudWatch EMF line a minute per process (`LawBid/Runtime`: EventLoopP50/P99/Max, heap, limit, RSS) + alarm at p99 > 250 ms for 10 min; 12 custom metrics ≈ $3.6/month at any size | fixed | 100k |
| 10 | Missing growth switches (replicas, proxy, search engine, image CDN, ...) and no alarm for the database processor | `infra/` review: 40 alarms, none on RDS CPU | `growth = {...}` object (replicas, RDS Proxy, OpenSearch, image CDN provider; cluster mode and multi-node LiveKit refuse with a clear message until built) + `db-cpu` alarm, see the ladder | fixed | all |
| 11 | Nested `select` runs as one query per relation (session ETag: 3 statements for 1 user row) | `trace.mjs` | Prisma `relationJoins` preview would make it one statement. Not enabled: it changes the generated client for all 100 services, needs a full regression | design | 1M (≈ −20 % statements on hot reads) |
| 12 | **Feed cold page = 23 database statements + ~24 Redis commands** | `trace.mjs`, `redis-trace.mjs` | the page is cached 60 s per person already. Next step is what Instagram / X do: a precomputed list of post ids per person in Redis (written when someone you follow posts), the page then needs 4 statements | design | 10M |
| 13 | Search ranking SQL (similarity over up to 1 000 candidates per branch) costs 38 ms of database time per uncached query (max 62 ms) at only 10 000 attorneys | `auto_explain` | cached 5 min per query already; OpenSearch is the switch (`growth.opensearch_enabled`), the provider seam `SEARCH_PROVIDER` exists, the OpenSearch provider is not written | design + switch | 10M |
| 14 | Counter flush (likes, comments, views) has **one leader for the whole fleet** (lock `counters.flush`, 500 rows per statement, every 10 s) | `counter-aggregator.service.ts` | fine up to ≈ 250 000 distinct counters per 10 s; then one leader per entity (6 locks) and a larger batch | design | 100M |
| 15 | Post view = a transaction with an advisory lock + insert + `NOT EXISTS`, then a counter bump: 5 round trips per reel view | `post-events.service.ts` | at 30 views per person per day and 200 M daily people this is 6 B inserts a day: sampling past a threshold and a stream (already named in the scale-limits audit, row "post_view_events") | design | 10M |
| 16 | Prisma client code is 20 % of API CPU (query building and response parsing, native engine not included) | `prof-top.mjs`: 20.1 % `@prisma/client`, 44 % idle under load | fewer statements per request is the lever (items 4, 5, 11, 12) | design | 1M |
| 17 | Redis needs about 8-16 commands per request even after #1 (blacklist check, flags, config, badges, caches): at 420 000 req/s that is 3-6 M commands/s | `redis-trace.mjs` | one node does ~100 000-200 000/s. Steps: in-process 1-2 s memo for flags/config (app config already has it), split cache vs queues (`redis_cache_node`), then cluster mode (the app's Lua scripts use keys of several slots: not built, gated by validation) | design + switch | 1M-100M |
| 18 | Scale-in/out: CPU 60 %, requests per task and worker queue depth already scale; minimum 2 tasks; scale-in 10 min | `infra/modules/ecs` | **p95 is deliberately not a scaling signal**: when the database is the slow part, adding tasks adds database load and makes p95 worse. The p95 alarm stays an alarm | checked | all |
| 19 | Health checks cost nothing: ALB `/health/live` every 15 s, no database call; readiness (database + Redis) is not used by the ALB | `health.controller.ts`, `alb/main.tf` | none needed | checked | all |
| 20 | Media: variants (256 / 320 / 1080) are made on upload by the worker, files are stored with `Cache-Control: public, max-age=31536000, immutable`, avatars 256 px; the public image base URL is one environment value | `files.policy.ts`, `s3-storage.service.ts` | `growth.cdn_images_provider = "bunny"` points public images at a Bunny pull zone (decision at ~10M: CloudFront ≈ $0.085/GB out, Bunny ≈ $0.01-0.005/GB) | switch | 10M |
| 21 | Network cost: S3 gateway endpoint exists (free); interface endpoints for ECR, logs, secrets, KMS exist; the remaining NAT traffic is push (FCM/APNs), Stripe, Twilio, Bunny: it cannot be avoided | `infra/modules/network` | nothing to add; a single NAT per AZ is kept for availability | checked | 1M |
| 22 | Logs: request log is sampled / errors only (scale-limits audit: 30-day retention on all groups); custom metrics: one EMF namespace of 12 metrics + the existing SLO metric filters | monitoring module | nothing to add | checked | 1M |
| 23 | Realtime fan-out: one publish per event however many recipients (`toUsers` with a list of rooms; sharded adapter mode), group messages fan out through 8 worker queues (`group-fanout-0..7`), badges are in Redis | `realtime-publisher.service.ts`, Redis keys | nothing to add. The client side (one event must not become N REST refetches) was fixed by the economy packages (events carry the data, `updatedSince`) | checked | 1M |
| 24 | CPU work off the main loop: image resize / video checks run in the worker service (BullMQ), PDFs (`pdfkit`, `pdf-lib`) are generated on the API request path | `grep` | moving PDFs to the worker needs a job + download link per tool (4 tools): not done; the new event-loop metric will say if it matters | design | 1M |

## Billion-user model (per person multiplied up)

Assumption (same as the scale-limits audit): 1 B registered, 200 M daily
people, 5 app opens a day, per open: app start (30 % changed), 1.5 feed
loads (cold), 1.5 chat list loads, notifications, badges; 1.5 reels pages a day.

| Quantity | Per daily person | At 200 M daily people | What it means |
|---|---|---|---|
| REST requests | ~60 / day | 139 000 / s average, 420 000 / s peak (x3) | ≈ 525 API tasks of 1 vCPU at the measured ~800 req/s mixed; Fargate ≈ $36 per task-month → ~$19 000 / month at peak size, ~$11 000 average |
| Database statements | ~290 / day (13 per app start x 1.5, 23 per feed x 7.5, 12 per chat list x 7.5, ...) | 665 000 / s average, 2 M / s peak | one PostgreSQL primary does 50 000-100 000 simple statements/s: **caching + replicas + sharding are not optional above ~10M**; items 11, 12 cut this by a third to a half |
| Redis commands | ~480 / day (8 per request; 13 before #1) | 1.1 M / s average, 3.3 M / s peak (before #1: 1.8 M / s average, 5.5 M / s peak) | 15-30 cache shards at peak: cluster mode (design) |
| Rate-limit commands | 60 / day (was 360) | 139 000 / s (was 833 000 / s) | #1 |
| Profile-view writes | up to 3 / day | up to 7 000 / s (was) → 1 per profile per 10 s | #3 |
| Token checks | 60 / day | 420 000 / s x 13.5 µs saved = 5.7 cores | #6 |
| Event-loop metric | - | 12 custom metrics | $3.6 / month at any size |

## What the owner needs to do

1. Merge, deploy. Nothing needs a new store build (server only).
2. `terraform plan` shows only the new alarms (event loop) and nothing else while `growth` is left empty.
3. The growth switches: see `docs/perf/GROWTH_LADDER_2026-10-23.md`.
4. Decide the "design" items by the size at which they bite: #12 feed id lists (10M), #13/#14/#15/#17 (10M-100M).

## Checks run

API `tsc`, `eslint` on every touched folder, `jest -w 2` (336 suites, 2 691 tests, all green), e2e (owner-chat-delivered, client-economy, auth-hardening, owner-people-search, owner-reels-attachments, owner-chat-actions, authz-matrix: 56 tests green), migrations check (no schema change, none needed: `EXPLAIN` of 16 hot queries on the seeded database found no missing index), `terraform fmt` and `terraform validate` for prod and staging. No DTO changed (no contract regeneration), no schema change (ERD unchanged).
