# api-p95 — p95 latency above target for 10 minutes

> **Для владельца:** Ничего не делать: сервер добавляет мощность сам. Повторяется каждый день — попросите Claude поднять потолок. Все письма и кнопки: [OWNER.md](OWNER.md).

Targets (docs/06 §9.4): reads p95 < 300 ms, writes < 600 ms (alarm at 600 ms).

**Check.**
1. *API health* board: is RPS unusual (traffic spike or a scraper)? WAF
   blocked requests?
2. *Database & Redis*: Redis CPU/memory, PostgreSQL query latency in the
   provider console (`pg_stat_statements` / query insights); transaction retries (40001) climbing → contention,
   see [db-contention.md](db-contention.md).
3. Logs Insights: `stats avg(responseTime), pct(responseTime, 95) by req.url`
   — a single slow endpoint points at a missing index or an N+1.
4. ECS CPU near 60–85 % → autoscaling should add tasks; if at max, see
   [ecs-capacity.md](ecs-capacity.md).

**Act.** Scale out (raise `api_max_tasks`), lower the WAF rate limit for
an abusive source, or roll back a deploy that introduced the slow path.

**After.** Reproduce with the k6 scenario for that endpoint
(`apps/api/k6`), fix, record in `docs/perf/`.


## event-loop
`<env>-api-eventloop-lag` / `-worker-eventloop-lag`: the Node event-loop delay p99 stayed above 300 ms for 10 minutes: the process is busy with synchronous work. It is the earliest sign before p95 climbs. Autoscale adds tasks by CPU; if it stays, look for a heavy job on the worker (admin → Здоровье системы → очереди) and ask Claude «event loop».
