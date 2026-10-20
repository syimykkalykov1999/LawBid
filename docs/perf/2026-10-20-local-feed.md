# 2026-10-20: local before/after, feed plan (not staging)

Setup: one 4-core box running API + Postgres 16 + Redis + load generator
(so absolute numbers are low; compare before/after only). 5 000 users,
100 000 posts, 300 load accounts following 150 attorneys each.
Tool: `apps/api/bench/hot-endpoints.mjs` (autocannon, 50 connections, 8 s).

| Endpoint | Before rps / p50 ms | After rps / p50 ms |
|---|---|---|
| GET /feed | 25 / 1717 | 204 / 201 |
| GET /notifications | 701 / 62 | 755 / 65 |
| GET /conversations | 575 / 83 | 605 / 80 |
| GET /search/posts | 238 / 212 | 212 / 231 |
| GET /search/attorneys | 500 / 94 | 461 / 99 |

Cause: Prisma sends `status = $1`; Postgres cannot use the partial index
`WHERE status = 'published'` with a parameter (EXPLAIN: 0.29 ms with a
literal, 46 ms with a parameter, 4 s with a cached generic plan on 100 k
posts, growing with the table). Fix: migrations `20261021000000_posts_visible_created_idx`, `…000100_posts_author_visible_idx` (built CONCURRENTLY, no write lock) and `…000200_feed_plan_stability_db`
(indexes that test only `IS NULL` + `plan_cache_mode = force_custom_plan`).
