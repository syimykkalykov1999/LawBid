## Owner 2026-10-16 — economy guard and automatic ceiling

- «не уйти в минус»: admin Система → **Экономика** (super admin). Third-party
  spend (AWS from the budget, SMS / video / translations = units × editable
  unit price) is projected for the month and compared with
  `economy.max_spend_percent` % (default 50) of the last 30 days' revenue
  (`payments` succeeded), never below `economy.min_threshold_usd` (default $150).
- `economy.guard` cron (every 5 minutes, `EconomyService.tick`): over the rule →
  provider caps (`budget.*`) cut to their floors (restored after, unless an
  admin changed them), new reel uploads refused (`VIDEO_UNAVAILABLE`, «paused»),
  SMS only for sign-in and password reset (`PROVIDER_BUDGET_EXCEEDED` for the
  rest), autoscaling at the minimum. Released below 90 % of the allowance.
  Log alerts `economy_guard_on` / `economy_guard_off` → CloudWatch e-mail, plus
  the event list on the card. Flag `economy_guard` (default on) = rollback.
- Ceiling: `api_max_tasks` / `worker_max_tasks` (now 50 / 20 in the launch
  example) are the hard cap; the real `MaxCapacity` is set by the job from
  what the rule can pay for (+5 tasks per tick at most), or by the owner's
  manual numbers (`economy.ceiling_mode` auto | manual). Terraform ignores
  `max_capacity` drift; night actions only move the minimum.
- DB / Redis: `AwsCapacityService` reads CloudWatch (DB CPU > 70 %, connections
  > 80 %, Redis memory > 75 %) → events + alert `capacity_pressure`; admin
  `POST /admin/economy/increase` (step-up) moves RDS / ElastiCache one tier
  up. Task role gets `cloudwatch:GetMetricStatistics`, `rds:*DBInstance`,
  `elasticache:*ReplicationGroup(s)` on the two resources only.
- API: `GET /admin/economy`, `PATCH /admin/economy/settings`,
  `POST /admin/economy/increase`; new super-only area `economy`.
