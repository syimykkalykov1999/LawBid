# api-p95 — p95 latency above target for 10 minutes

Targets (docs/06 §9.4): reads p95 < 300 ms, writes < 600 ms (alarm at 600 ms).

**Check.**
1. *API health* board: is RPS unusual (traffic spike or a scraper)? WAF
   blocked requests?
2. *Database & Redis*: Redis CPU/memory, CockroachDB SQL latency in the
   Cloud Console; transaction retries (40001) climbing → contention,
   see [db-contention.md](db-contention.md).
3. Logs Insights: `stats avg(responseTime), pct(responseTime, 95) by req.url`
   — a single slow endpoint points at a missing index or an N+1.
4. ECS CPU near 60–85 % → autoscaling should add tasks; if at max, see
   [ecs-capacity.md](ecs-capacity.md).

**Act.** Scale out (raise `api_max_tasks`), lower the WAF rate limit for
an abusive source, or roll back a deploy that introduced the slow path.

**After.** Reproduce with the k6 scenario for that endpoint
(`apps/api/k6`), fix, record in `docs/perf/`.
