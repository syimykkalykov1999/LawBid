# api-cpu / worker-cpu — CPU > 85 % for 10 minutes

> **Для владельца:** Сервер растёт сам до потолка. Не запускается 10 минут — Rollback production. Упирается каждый день — поднять потолок. Все письма и кнопки: [OWNER.md](OWNER.md).

Autoscaling targets 60 % CPU (docs/06 §6.3). Sustained 85 % means the
service is at `*_max_tasks` or scaling is slower than the load.

**Check.** ECS service → tasks running vs desired vs max; *API health*
RPS; is the load organic (marketing push) or abusive (WAF)?

**Act.** Raise `api_max_tasks` / `worker_max_tasks` in
`infra/envs/<env>/terraform.tfvars` and apply; for an abusive source lower
the WAF rate rule. Record the new ceiling in `docs/perf/`.

## Automatic ceiling (owner 2026-10-16)

`api_max_tasks` / `worker_max_tasks` are only the **hard cap**. Every 5
minutes the `economy.guard` job (admin → Система → Экономика) sets the
real autoscaling ceiling to what the revenue rule can pay for (third-party
spend ≤ X % of the last 30 days' revenue, not below $Y), never below
`min_tasks` and never above the hard cap; it rises at most 5 tasks per
tick and falls at once. Over the rule it drops to `min_tasks`. The owner
can switch the ceiling to «вручную» (a number inside the hard cap) on the
same card. `terraform apply` leaves the running ceiling alone
(`ignore_changes = [max_capacity]`).

Before a big launch check the account's **Fargate On-Demand vCPU quota**
(Service Quotas): the hard cap 50 API + 20 worker at 0.5 vCPU needs 35 vCPU,
a new account starts at 6.


## heap
`<env>-api-heap-ratio` / `-worker-heap-ratio`: the V8 heap is above 85 % of its limit for 10 minutes; an out-of-memory restart follows. The task-level memory alarm (`<env>-<svc>-memory`, 85 %) lives in `infra/modules/monitoring/coverage.tf`. Ask Claude «куча api» to raise the task memory or look for a leak.
