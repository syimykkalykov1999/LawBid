# redis-cpu / redis-memory — ElastiCache above 80 %

Redis carries cache, rate limits, BullMQ queues, Socket.IO adapter,
counters (docs/06 §6.3); it is not a source of truth (§6.4).

**Check.** *Database & Redis* board; `INFO keyspace` from a maintenance
shell — which prefixes grow (`bull:*`, `rl:*`, `sub:*`, `cnt:*`)?
BullMQ backlog → [queues.md](queues.md).

**Act.** Memory: clear a runaway key family after confirming it is
regenerable (caches have TTLs; queues must not be flushed). CPU: scale the
node type (`redis_node_type`) — apply in the maintenance window
(`apply_immediately = false`). Failover is automatic (multi-AZ).
