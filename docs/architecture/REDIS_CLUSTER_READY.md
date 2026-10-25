# Redis cluster-ready (2026-10-24)

Goal: the app can move from one Redis node group to a sharded ElastiCache
group (cluster mode enabled) by one switch, with no behaviour change while the
switch is off. The owner steps are in [docs/runbooks/redis-cluster.md](../runbooks/redis-cluster.md).

## Research notes (sources read 2026-10-24)

- **ElastiCache, CMD to CME.** AWS docs «Modifying cluster mode» (docs.aws.amazon.com/AmazonElastiCache/latest/dg/modify-cluster-mode.html): in place it is two steps, `compatible` then `enabled`; needs Redis OSS 7.0+ / Valkey 7.2+, keys only in db 0, automatic failover with at least 1 replica, a cluster-protocol client; the endpoints CHANGE at `enabled`; the change cannot be reverted from `enabled` (only `compatible` to `disabled`). In `compatible` mode scaling and engine changes are not allowed. AWS «Online migration» is for self-hosted Redis on EC2 to ElastiCache, not for ElastiCache to ElastiCache.
- **BullMQ.** docs.bullmq.io/patterns/redis-cluster: a `{hash tag}` in the queue `prefix` (or the queue name) keeps all keys of a queue in one slot; a different prefix per queue spreads queues over shards; the `connection` may be an ioredis `Cluster`. Workers need `maxRetriesPerRequest: null`.
- **Socket.IO.** socket.io/docs/v4/redis-adapter (checked 2026-10-24): the sharded adapter (`createShardedAdapter`) works with an ioredis `Cluster` created with `shardedSubscribers: true` (ioredis 5.9+, Redis 7+); `pubClient.duplicate()` as the sub client. The classic adapter would put every event on the cluster bus. Installed here: ioredis 6.0.0, `@socket.io/redis-adapter` 8.3.0 (has the cluster branch in util.js).
- **ElastiCache TLS + ioredis.** ioredis README «AWS ElastiCache Clusters with TLS»: `dnsLookup: (address, cb) => cb(null, address)` and `redisOptions: { tls: {} }`, otherwise the certificate check fails on re-resolved IPs.
- **Pipelines and MULTI.** ioredis `Pipeline.js` (read in node_modules): all keys of a pipeline must sit in one slot allocation group, else the pipeline is rejected; MULTI and Lua need one slot (`CROSSSLOT`). MGET, multi-key DEL/EXISTS likewise. SCAN sees one node.
- **How others cut over.** No in-place "magic" for a busy queue: the safe pattern is a NEW cluster built beside the old one, the app switched by one flag with a deploy, queues drained first (jobs are not copied; BullMQ keys live in the old group), the old group kept for a rollback window. The in-place `compatible` path of AWS is possible but blocks scaling while in it and cannot be undone after `enabled`; we chose the new group.

## Design

1. **One factory** `apps/api/src/redis/redis-connection.ts`: `createRedisClient(url, opts)` returns `new Redis(url, opts)` (standalone) or an ioredis `Cluster` when `REDIS_CLUSTER=true` (TLS from `rediss://`, identity `dnsLookup`, `shardedSubscribers`, optional `REDIS_CLUSTER_NAT_MAP` for a local docker cluster). `bullOptions(queue, url, {worker})` gives every BullMQ `Queue`/`Worker` its connection and, in cluster mode, the prefix `{queue}` (one tag per queue). The shared `REDIS_CLIENT` (cache, throttler, locks, pub/sub, shard-map sync, outbox, Socket.IO pub/sub) is built by the factory in `RedisModule`; `.duplicate()` of it is a Cluster too.
2. **Hash-tag convention** (`redis-cluster-safe.ts`): `ck(tag, key)` = `{tag}key` in cluster mode and the key itself otherwise; `mgetSafe`, `delSafe`, `existsSafe` (parallel single-key calls in cluster mode); `pipeline(redis)` (a non-atomic pipeline split by slot group, same result order). Applied to: throttler (2-key Lua), admin sessions, OTP (4-key Lua), case views, counters, feed reco, ops streaks, ops/realtime/SLO stats, presence, event log, badges, block sets, SMS guard, i18n versions, client activity, bar attempts, OTP cleanup (SCAN on every master). Cost-guard keys were already `{provider}` / `{m}` tagged.
3. **Guard test** `redis-cluster-scan.spec.ts` scans `apps/api/src`: no `new Redis(`/`new Cluster(`/raw BullMQ `connection: { url }` outside the factory; every multi-key call kind (MGET, multi-key DEL/EXISTS, MULTI, raw pipeline, SCAN, Lua `KEYS[2+]`, set operations) must have an entry with the reason in `redis-cluster-scan.allowlist.json`; stale entries fail.
4. **Socket.IO**: `socketAdapterMode()` returns `sharded` whenever `REDIS_CLUSTER` is on (even with `SOCKET_IO_ADAPTER=classic`); the gateway and `RealtimePublisher` already used sharded pub/sub (SPUBLISH/SSUBSCRIBE).
5. **Infra**: `modules/redis` builds, when `cluster_mode`, a second group `<name>-redis-cl` (parameter group `cluster-enabled yes`, `num_node_groups`, `replicas_per_node_group`) and the secret `REDIS_CLUSTER_URL` (configuration endpoint). Stack variable `redis_cluster_mode = "off" | "standby" | "on"`; `on` makes `REDIS_URL` point to the cluster and sets `REDIS_CLUSTER=true` in the same apply. The standalone group stays (LiveKit and rollback use it).
6. **Autoscaler**: the Lambda already skips a group with `ClusterEnabled` (`decision.py`, reason `cluster_mode`); the stack also removes the autoscale module when `redis_cluster_mode = "on"`, so there is no skip e-mail noise. Cluster shards are resized by hand (online resharding, runbook).
7. **Search alert**: every search answered by Postgres logs `{metric: "search_latency", op, engine: "postgres", ms}`; `modules/monitoring` has the metric filter `search-pg-latency` and the alarm `search-slow` (p95 > 300 ms, 3 x 5 minutes, e-mail «Поиск отвечает медленно — пора включить отдельный поиск (Админка → Настройки → search.engine)»; `search_p95_alarm_ms = 0` switches it off). The admin «Масштаб» alarm cards are built from health lights, not from CloudWatch alarms, so no card was added there (a search light would need cross-instance state).

## Known limits

- Queues are not copied between groups: drain them before the switch (runbook).
- Cluster mode does not support `SELECT` / db other than 0 (the app uses db 0 only).
- `REDIS_CACHE_URL` (separate cache node) is not read by the app today; unchanged.
- LiveKit keeps the standalone group (its own Redis config).
- Not exercised against a real multi-shard cluster in CI; see the report for what was run locally.
