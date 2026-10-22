# redis-cpu / redis-memory — ElastiCache above 80 %

> **Для владельца:** Обычно проходит само. Держится больше суток — увеличить Redis при следующем «ставь на AWS». Все письма и кнопки: [OWNER.md](OWNER.md).

Redis carries cache, rate limits, BullMQ queues, Socket.IO adapter,
counters (docs/06 §6.3); it is not a source of truth (§6.4).

**Check.** *Database & Redis* board; `INFO keyspace` from a maintenance
shell — which prefixes grow (`bull:*`, `rl:*`, `sub:*`, `cnt:*`)?
BullMQ backlog → [queues.md](queues.md).

**Act.** Memory: clear a runaway key family after confirming it is
regenerable (caches have TTLs; queues must not be flushed). CPU: scale the
node type (`redis_node_type`) — apply in the maintenance window
(`apply_immediately = false`). Failover is automatic (multi-AZ).

## Разделение (plan, owner 2026-10-22 — sizes unchanged for now)

Today one Redis (`lawbid-prod-redis`, launch size `cache.t4g.micro`, no
replica) holds everything with `maxmemory-policy = noeviction`. That policy
is required for BullMQ (an evicted job key corrupts a queue) and right for
the Socket.IO adapter / presence, but wrong for caches: when memory is full,
`noeviction` refuses **every** write, so a growing cache can stop the queues
and realtime too. Industry practice (BullMQ docs «Going to production»,
AWS ElastiCache best practices) is two Redis: queues/realtime on
`noeviction`, cache on `allkeys-lru`.

| Redis | Holds | Policy | Terraform |
|---|---|---|---|
| main (`REDIS_URL`) | BullMQ `bull:*`, Socket.IO adapter, presence, rate limits `rl:*`, counters `cnt:*`, badges | `noeviction` | `module.redis` (as today) |
| cache (`REDIS_CACHE_URL`) | feed page cache, other TTL caches | `allkeys-lru` | `module.redis_cache`, `redis_cache_node = true` |

Steps when memory of the main Redis stays above ~60 % or before growth:

1. `redis_cache_node = true` (optional `redis_cache_node_type`, default
   `cache.t4g.micro` ≈ $12/month, no replica — a lost cache only costs a
   refill) → `terraform plan` / `apply`. Terraform creates the node and the
   `lawbid-prod-cache/REDIS_URL` secret, and injects it as `REDIS_CACHE_URL`
   into api / worker (a new task definition revision).
2. App change (not done yet): cache code reads `REDIS_CACHE_URL` when set,
   falls back to `REDIS_URL`. Rate limits and badges stay on the main Redis
   (they must not be evicted).
3. After deploy: watch `DatabaseMemoryUsagePercentage` of both; then flush
   the old cache prefixes from the main Redis.

The `maxmemory_policy` variable of `modules/redis` is validated: only
`noeviction` or an LRU/LFU policy; never set the main Redis to an evicting
policy.
