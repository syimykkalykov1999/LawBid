# api-cpu / worker-cpu — CPU > 85 % for 10 minutes

Autoscaling targets 60 % CPU (docs/06 §6.3). Sustained 85 % means the
service is at `*_max_tasks` or scaling is slower than the load.

**Check.** ECS service → tasks running vs desired vs max; *API health*
RPS; is the load organic (marketing push) or abusive (WAF)?

**Act.** Raise `api_max_tasks` / `worker_max_tasks` in
`infra/envs/<env>/terraform.tfvars` and apply; for an abusive source lower
the WAF rate rule. Record the new ceiling in `docs/perf/`.
